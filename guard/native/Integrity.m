#define _WIN32_WINNT 0x0601
#define WIN32_LEAN_AND_MEAN
#include <objc/Object.h>
#include <objc/runtime.h>
/* GNU ObjC BOOL is a byte; Win32 BOOL is an int. Preserve both ABIs. */
#define BOOL WINBOOL
#include <windows.h>
#include <winternl.h>
#include <bcrypt.h>
#undef BOOL
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <wchar.h>
#include <io.h>
#include <fcntl.h>

#define PATH_CAP 32768
#define DEPTH_CAP 256
#define MANIFEST_CAP (16 * 1024 * 1024)
extern int guard_equal32(const unsigned char *, const unsigned char *);
extern int guard_distribution_path(const unsigned char *, size_t, unsigned char *, size_t);
typedef struct { HANDLE handles[DEPTH_CAP]; size_t count; } DirectoryChain;

static void close_chain(DirectoryChain *chain) {
    while (chain->count) CloseHandle(chain->handles[--chain->count]);
}

static void json_string(const char *text) {
    putchar('"');
    for (const unsigned char *p = (const unsigned char *)text; *p; ++p) {
        if (*p == '"' || *p == '\\') { putchar('\\'); putchar(*p); }
        else if (*p < 32) printf("\\u%04x", (unsigned)*p);
        else putchar(*p);
    }
    putchar('"');
}

typedef NTSTATUS (NTAPI *OpenRelative)(PHANDLE, ACCESS_MASK, POBJECT_ATTRIBUTES,
    PIO_STATUS_BLOCK, PLARGE_INTEGER, ULONG, ULONG, ULONG, ULONG, PVOID, ULONG);
typedef ULONG (WINAPI *StatusToError)(NTSTATUS);
static OpenRelative open_relative;
static StatusToError status_to_error;

/* Opening one component relative to a pinned directory prevents rename races.
 * FILE_OPEN_REPARSE_POINT opens links themselves, never their destinations. */
static HANDLE open_child(HANDLE parent, wchar_t *name, int directory) {
    UNICODE_STRING part = {0};
    part.Length = (USHORT)(wcslen(name) * sizeof(wchar_t));
    part.MaximumLength = part.Length;
    part.Buffer = name;
    OBJECT_ATTRIBUTES attrs = {0};
    attrs.Length = sizeof(attrs);
    attrs.RootDirectory = parent;
    attrs.ObjectName = &part;
    attrs.Attributes = OBJ_CASE_INSENSITIVE;
    IO_STATUS_BLOCK io = {0};
    HANDLE handle = INVALID_HANDLE_VALUE;
    NTSTATUS status = open_relative(&handle,
        SYNCHRONIZE | FILE_READ_ATTRIBUTES | (directory ? FILE_TRAVERSE : FILE_READ_DATA),
        &attrs, &io, NULL, 0,
        FILE_SHARE_READ,
        1 /* FILE_OPEN */, 0x00200000 /* FILE_OPEN_REPARSE_POINT */ |
        0x20 /* FILE_SYNCHRONOUS_IO_NONALERT */, NULL, 0);
    if (status < 0) {
        SetLastError(status_to_error(status));
        return INVALID_HANDLE_VALUE;
    }
    return handle;
}

static const char *handle_kind(HANDLE handle, int directory) {
    BY_HANDLE_FILE_INFORMATION info;
    if (!GetFileInformationByHandle(handle, &info)) return "unreadable";
    if (info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) return "reparse_point";
    if (!!(info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != directory)
        return directory ? "not_directory" : "not_file";
    return NULL;
}

static const char *open_error(void) {
    DWORD code = GetLastError();
    return code == ERROR_FILE_NOT_FOUND || code == ERROR_PATH_NOT_FOUND ? "missing" : "unreadable";
}

static int safe_path(const wchar_t *path) {
    size_t total = wcslen(path), start = 0;
    if (!total || total >= PATH_CAP - 1) return 0;
    for (size_t i = 0; i <= total; ++i) {
        wchar_t c = path[i];
        if (!c || c == '/' || c == '\\') {
            size_t length = i - start;
            if (!length || length > 255 || path[i - 1] == '.' || path[i - 1] == ' ')
                return 0;
            if (path[start] == '.' && (length == 1 || (length == 2 && path[start + 1] == '.')))
                return 0;
            size_t stem = 0;
            while (stem < length && path[start + stem] != '.') ++stem;
            if ((stem == 3 && (!_wcsnicmp(path + start, L"CON", 3) ||
                 !_wcsnicmp(path + start, L"PRN", 3) || !_wcsnicmp(path + start, L"AUX", 3) ||
                 !_wcsnicmp(path + start, L"NUL", 3))) ||
                (stem == 4 && (!_wcsnicmp(path + start, L"COM", 3) ||
                 !_wcsnicmp(path + start, L"LPT", 3)) &&
                 ((path[start + 3] >= '0' && path[start + 3] <= '9') ||
                   path[start + 3] == 0xb9 || path[start + 3] == 0xb2 || path[start + 3] == 0xb3)))
                return 0;
            start = i + 1;
        } else if (c < 32 || c == ':' || c == '"' || c == '<' || c == '>' || c == '|' || c == '*' || c == '?') {
            return 0;
        }
    }
    return 1;
}

static const char *pin_root(const wchar_t *root, DirectoryChain *chain) {
    wchar_t path[PATH_CAP];
    DWORD size = GetFullPathNameW(root, PATH_CAP, path, NULL);
    if (!size || size >= PATH_CAP || !((path[0] >= 'A' && path[0] <= 'Z') ||
        (path[0] >= 'a' && path[0] <= 'z')) || path[1] != ':' || path[2] != '\\')
        return "Root must resolve to a local drive path";
    while (size > 3 && path[size - 1] == '\\') path[--size] = 0;
    if (size > 3 && !safe_path(path + 3)) return "Invalid root path";
    HANDLE handle = CreateFileW(path, FILE_TRAVERSE | FILE_READ_ATTRIBUTES,
        FILE_SHARE_READ, NULL, OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, NULL);
    if (handle == INVALID_HANDLE_VALUE) return "Cannot open root directory";
    chain->handles[chain->count++] = handle;
    const char *reason = handle_kind(handle, 1);
    if (reason) return reason;
    wchar_t final[PATH_CAP];
    DWORD finalSize = GetFinalPathNameByHandleW(handle, final, PATH_CAP, FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
    if (!finalSize || finalSize >= PATH_CAP) return "Cannot resolve pinned root";
    const wchar_t *resolved = !wcsncmp(final, L"\\\\?\\", 4) ? final + 4 : final;
    if (_wcsicmp(resolved, path)) return "Root path redirected through a reparse point";
    return NULL;
}

static char *load_manifest(const wchar_t *path, size_t *length, const char **error, int allow_empty) {
    HANDLE file = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING,
        FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_SEQUENTIAL_SCAN, NULL);
    if (file == INVALID_HANDLE_VALUE) { *error = "Cannot open manifest"; return NULL; }
    LARGE_INTEGER size;
    char *text = NULL;
    if (handle_kind(file, 0) || !GetFileSizeEx(file, &size) || size.QuadPart < 0 ||
        (!allow_empty && !size.QuadPart) || size.QuadPart > MANIFEST_CAP) {
        *error = "Manifest must be a regular file at most 16 MiB (scan requires records)";
    } else {
        text = malloc((size_t)size.QuadPart + 1);
        if (!text) *error = "Out of memory";
        else {
            DWORD bytes = 0;
            if (!ReadFile(file, text, (DWORD)size.QuadPart, &bytes, NULL) || bytes != size.QuadPart)
                *error = "Cannot read manifest";
            else {
                text[bytes] = 0;
                *length = bytes;
                if (memchr(text, 0, bytes) || (bytes &&
                    !MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text, bytes, NULL, 0)))
                    *error = "Manifest is not strict UTF-8 text";
            }
        }
    }
    CloseHandle(file);
    if (*error) { free(text); return NULL; }
    return text;
}

static int hex_digit(unsigned char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

@interface GuardIntegrity : Object {
    BCRYPT_ALG_HANDLE algorithm;
    PUCHAR hashObject;
    DWORD hashObjectSize;
    DirectoryChain rootChain;
    unsigned checked;
    unsigned violations;
}
- (int)scanManifest:(const wchar_t *)manifest root:(const wchar_t *)root;
- (const char *)checkPath:(wchar_t *)path expected:(const unsigned char *)expected;
- (const char *)hashFile:(HANDLE)file digest:(unsigned char *)digest;
- (void)violation:(const char *)path reason:(const char *)reason;
@end

@implementation GuardIntegrity
- (void)violation:(const char *)path reason:(const char *)reason {
    if (violations++) putchar(',');
    fputs("{\"path\":", stdout);
    json_string(path);
    fputs(",\"reason\":", stdout);
    json_string(reason);
    putchar('}');
}

- (const char *)hashFile:(HANDLE)file digest:(unsigned char *)digest {
    BCRYPT_HASH_HANDLE hash = NULL;
    if (BCryptCreateHash(algorithm, &hash, hashObject, hashObjectSize, NULL, 0, 0) < 0)
        return "hash_error";
    unsigned char buffer[65536];
    const char *reason = NULL;
    for (;;) {
        DWORD bytes;
        if (!ReadFile(file, buffer, sizeof(buffer), &bytes, NULL)) { reason = "unreadable"; break; }
        if (!bytes) break;
        if (BCryptHashData(hash, buffer, bytes, 0) < 0) { reason = "hash_error"; break; }
    }
    if (!reason && BCryptFinishHash(hash, digest, 32, 0) < 0) reason = "hash_error";
    BCryptDestroyHash(hash);
    return reason;
}

- (const char *)checkPath:(wchar_t *)path expected:(const unsigned char *)expected {
    if (!safe_path(path)) return "unsafe_path";
    DirectoryChain chain = {0};
    HANDLE parent = rootChain.handles[rootChain.count - 1];
    HANDLE file = INVALID_HANDLE_VALUE;
    const char *reason = NULL;
    for (wchar_t *part = path; *part;) {
        wchar_t *end = wcspbrk(part, L"/\\");
        if (end) *end = 0;
        file = open_child(parent, part, end != NULL);
        if (file == INVALID_HANDLE_VALUE) { reason = open_error(); break; }
        reason = handle_kind(file, end != NULL);
        if (reason) break;
        if (!end) {
            unsigned char digest[32];
            reason = [self hashFile:file digest:digest];
            if (!reason && !guard_equal32(digest, expected)) reason = "changed";
            break;
        }
        if (chain.count == DEPTH_CAP) { reason = "unsafe_path"; break; }
        chain.handles[chain.count++] = file;
        parent = file;
        file = INVALID_HANDLE_VALUE;
        part = end + 1;
    }
    if (file != INVALID_HANDLE_VALUE) CloseHandle(file);
    close_chain(&chain);
    return reason;
}

- (int)scanManifest:(const wchar_t *)manifest root:(const wchar_t *)root {
    const char *error = NULL;
    char *text = NULL;
    size_t length = 0;
    DWORD propertySize = 0;
    fputs("{\"violations\":[", stdout);
    HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
    open_relative = (OpenRelative)(void *)GetProcAddress(ntdll, "NtCreateFile");
    status_to_error = (StatusToError)(void *)GetProcAddress(ntdll, "RtlNtStatusToDosError");
    if (!open_relative || !status_to_error) { error = "Windows native file API unavailable"; goto finish; }
    error = pin_root(root, &rootChain);
    if (error) goto finish;
    text = load_manifest(manifest, &length, &error, 0);
    if (!text) goto finish;
    if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, NULL, 0) < 0 ||
        BCryptGetProperty(algorithm, BCRYPT_OBJECT_LENGTH, (PUCHAR)&hashObjectSize,
            sizeof(hashObjectSize), &propertySize, 0) < 0) {
        error = "BCrypt SHA256 unavailable"; goto finish;
    }
    hashObject = malloc(hashObjectSize);
    if (!hashObject) { error = "Out of memory"; goto finish; }
    char *cursor = text;
    if (length >= 3 && !memcmp(cursor, "\xef\xbb\xbf", 3)) cursor += 3;
    while (cursor < text + length) {
        char *line = cursor;
        char *end = memchr(cursor, '\n', (size_t)(text + length - cursor));
        cursor = end ? end + 1 : text + length;
        if (!end) end = text + length;
        else if (end > line && end[-1] == '\r') --end;
        *end = 0;
        size_t lineLength = (size_t)(end - line);
        if (lineLength <= 66 || line[64] != ' ' || line[65] != ' ') {
            error = "Manifest requires SHA256, two spaces, and a relative path on every line";
            break;
        }
        unsigned char expected[32];
        for (size_t i = 0; i < 32; ++i) {
            int high = hex_digit(line[i * 2]), low = hex_digit(line[i * 2 + 1]);
            if (high < 0 || low < 0) { error = "Manifest contains an invalid SHA256"; break; }
            expected[i] = (unsigned char)((high << 4) | low);
        }
        if (error) break;
        wchar_t path[PATH_CAP];
        if (!MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, line + 66, -1, path, PATH_CAP)) {
            error = "Manifest path exceeds Windows path limit";
            break;
        }
        ++checked;
        const char *reason = [self checkPath:path expected:expected];
        if (reason) {
            [self violation:line + 66 reason:reason];
            if (!strcmp(reason, "hash_error")) { error = "BCrypt SHA256 operation failed"; break; }
        }
    }
    if (!error && !checked) error = "Manifest contains no records";
finish:
    free(text);
    free(hashObject);
    if (algorithm) BCryptCloseAlgorithmProvider(algorithm, 0);
    close_chain(&rootChain);
    printf("],\"ok\":%s,\"checked\":%u,\"engine\":\"Objective-C + x64 assembly\"",
        !error && !violations ? "true" : "false", checked);
    if (error) { fputs(",\"error\":", stdout); json_string(error); }
    fputs("}\n", stdout);
    return error ? 1 : violations ? 2 : 0;
}
@end

typedef struct { wchar_t *path; char *text; int kind; } DistributionEntry;
typedef struct { char *text; wchar_t *wide; DistributionEntry *entries; size_t count; } DistributionList;

static int distribution_compare(const void *a, const void *b) {
    const DistributionEntry *left = a, *right = b;
    return CompareStringOrdinal(left->path, -1, right->path, -1, TRUE) - CSTR_EQUAL;
}

static void distribution_violation(const char *path, const char *reason,
                                   const char *inventory, unsigned *violations) {
    if ((*violations)++) putchar(',');
    fputs("{\"path\":", stdout); json_string(path);
    fputs(",\"reason\":", stdout); json_string(reason);
    fputs(",\"inventory\":", stdout); json_string(inventory); putchar('}');
}

/* Inventories are resolved filesystem names, never URL strings or globs.
 * Empty inventories are valid; the metadata emitter owns completeness.
 * Normalize bytes in assembly, then validate strict UTF-8/Win32 semantics.
 * CompareStringOrdinal(TRUE) matches Windows Unicode case, not C locale. */
static const char *distribution_load(const wchar_t *file, DistributionList *list,
                                    int is_public, unsigned *checked, unsigned *violations) {
    const char *error = NULL;
    size_t length = 0;
    list->text = load_manifest(file, &length, &error, 1);
    if (!list->text) return error;
    char *cursor = list->text;
    if (length >= 3 && !memcmp(cursor, "\xef\xbb\xbf", 3)) cursor += 3;
    size_t capacity = 0;
    for (char *p = cursor; p < list->text + length; ++p) if (*p == '\n') ++capacity;
    if (cursor < list->text + length && list->text[length - 1] != '\n') ++capacity;
    if (capacity) {
        list->entries = calloc(capacity, sizeof(*list->entries));
        if (!list->entries) return "Out of memory";
        list->wide = malloc((length + 1) * sizeof(wchar_t));
        if (!list->wide) return "Out of memory";
    }
    size_t wide_offset = 0;
    while (cursor < list->text + length) {
        char *line = cursor;
        char *end = memchr(cursor, '\n', (size_t)(list->text + length - cursor));
        cursor = end ? end + 1 : list->text + length;
        if (!end) end = list->text + length;
        else if (end > line && end[-1] == '\r') --end;
        *end = 0;
        size_t bytes = (size_t)(end - line);
        if (is_public) ++*checked;
        int kind = guard_distribution_path((const unsigned char *)line, bytes,
                                          (unsigned char *)line, bytes + 1);
        wchar_t *wide = list->wide + wide_offset;
        if (kind == 2 || !MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS,
                line, -1, wide, (int)(length + 1 - wide_offset)) || !safe_path(wide)) {
            distribution_violation(line, "unsafe_path", is_public ? "public" : "private", violations);
            continue;
        }
        wide_offset += wcslen(wide) + 1;
        list->entries[list->count++] = (DistributionEntry){wide, line, kind};
    }
    if (!is_public && list->count > 1)
        qsort(list->entries, list->count, sizeof(*list->entries), distribution_compare);
    return NULL;
}

static void distribution_free(DistributionList *list) {
    free(list->wide);
    free(list->entries);
    free(list->text);
}

static int distribution_scan(const wchar_t *public_file, const wchar_t *private_file) {
    DistributionList public = {0}, private = {0};
    unsigned checked = 0, violations = 0;
    fputs("{\"violations\":[", stdout);
    const char *error = distribution_load(private_file, &private, 0, &checked, &violations);
    if (!error) error = distribution_load(public_file, &public, 1, &checked, &violations);
    if (!error) {
        for (size_t i = 0; i < public.count; ++i) {
            DistributionEntry *entry = &public.entries[i];
            const char *reason = NULL;
            if (private.count && bsearch(entry, private.entries, private.count,
                                        sizeof(*private.entries), distribution_compare))
                reason = "private_overlap";
            else if (entry->kind == 1) reason = "private_name";
            if (reason) distribution_violation(entry->text, reason, "public", &violations);
        }
    }
    printf("],\"ok\":%s,\"checked\":%u,\"engine\":\"Objective-C + x64 assembly\"",
           !error && !violations ? "true" : "false", checked);
    if (error) { fputs(",\"error\":", stdout); json_string(error); }
    fputs("}\n", stdout);
    distribution_free(&public);
    distribution_free(&private);
    return error ? 1 : violations ? 2 : 0;
}

/* Guard pages catch even a one-byte overread/overwrite at the ABI boundary. */
static int distribution_selfcheck(void) {
    static const struct { const char *path; int expected; } cases[] = {
        {"qb-core/client/main.lua", 0}, {"r/stream/city.rpf", 0},
        {"r/ui/server/index.js", 0}, {"r/ui/server.svg", 0},
        {"server/client.lua", 0}, {"r/shared/config.lua", 0},
        {"r/ui/methtray_100%.png", 0}, {"r/100%cash.lua", 2},
        {"r/modules/client.lua", 0}, {"r/server/main.lua", 1},
        {"r/SERVER.LUA", 1}, {"r\\SV_money.LUA", 1},
        {"r/modules/server/main.lua", 1}, {"r/server_config/key.json", 1},
        {"r/secrets.json", 1}, {"r/credentials/key", 1},
        {"r/.env", 1}, {"r/.env.production", 1}, {"r/.git/config", 1},
        {"r/db/x", 1}, {"r/schema.SQL", 1}, {"r/data.sqlite3", 1},
        {"r/archive.zip", 1}, {"r/source.lua.bak", 1},
        {"r/../client.lua", 2}, {"/r/client.lua", 2}, {"r//client.lua", 2},
        {"r/client.lua/", 2}, {"r/client.lua:stream", 2}, {"r/x.", 2},
        {"r/x ", 2}, {"r/%2e%2e/x", 2}, {"r/%252e/x", 2},
        {"r/x?y", 2}, {"r/x\t", 2}, {"r", 2}, {"", 2}
    };
    unsigned checked = 0, failures = 0;
    SYSTEM_INFO info;
    GetSystemInfo(&info);
    size_t page = info.dwPageSize;
    unsigned char *memory = VirtualAlloc(NULL, page * 4, MEM_RESERVE | MEM_COMMIT, PAGE_READWRITE);
    const char *error = NULL;
    DWORD old;
    if (!memory || !VirtualProtect(memory + page, page, PAGE_NOACCESS, &old) ||
        !VirtualProtect(memory + page * 3, page, PAGE_NOACCESS, &old)) {
        error = "Cannot allocate selfcheck guard pages";
        goto finish;
    }
    for (size_t i = 0; i < sizeof(cases) / sizeof(*cases); ++i) {
        size_t length = strlen(cases[i].path);
        unsigned char *source = memory + page - length;
        unsigned char *target = memory + page * 3 - length - 1;
        memcpy(source, cases[i].path, length);
        int result = guard_distribution_path(source, length, target, length + 1);
        ++checked;
        if (result != cases[i].expected || (result != 2 && target[length])) ++failures;
    }
    /* Every byte participates under explicit length, including embedded NUL.
     * Non-ASCII bytes are preserved here; strict UTF-8 is the caller's job. */
    for (unsigned value = 0; value < 256; ++value) {
        unsigned char *source = memory + page - 5;
        unsigned char *target = memory + page * 3 - 6;
        memcpy(source, "r/xay", 5); source[3] = (unsigned char)value;
        int unsafe = value < 32 || value == 127 || strchr(":\"<>|*?", value) != NULL;
        int result = guard_distribution_path(source, 5, target, 6);
        ++checked;
        if (result != (unsafe ? 2 : 0)) ++failures;
    }
    unsigned char *source = memory + page - 5;
    unsigned char *target = memory + page * 3 - 6;
    memcpy(source, "R\\X.A", 5);
    ++checked;
    if (guard_distribution_path(source, 5, target, 6) || memcmp(target, "r/x.a", 6)) ++failures;
    memcpy(target, "R\\X.A", 5);
    ++checked;
    if (guard_distribution_path(target, 5, target, 6) || memcmp(target, "r/x.a", 6)) ++failures;
    ++checked;
    if (guard_distribution_path(memory + page, 1, target, 1) != 2) ++failures;
    ++checked;
    if (guard_distribution_path(memory + page, 32767, target, 32768) != 2) ++failures;
    DistributionEntry a = {L"r/caf\u00e9.lua", NULL, 0}, b = {L"R/CAF\u00c9.LUA", NULL, 0};
    ++checked;
    if (distribution_compare(&a, &b)) ++failures;
finish:
    if (memory) VirtualFree(memory, 0, MEM_RELEASE);
    printf("{\"ok\":%s,\"checked\":%u,\"failures\":%u,\"engine\":\"Objective-C + x64 assembly\"",
           !error && !failures ? "true" : "false", checked, failures);
    if (error) { fputs(",\"error\":", stdout); json_string(error); }
    fputs("}\n", stdout);
    return error ? 1 : failures ? 2 : 0;
}

int wmain(int argc, wchar_t **argv) {
    _setmode(_fileno(stdout), _O_BINARY);
    if (argc == 4 && !wcscmp(argv[1], L"distribution"))
        return distribution_scan(argv[2], argv[3]);
    if (argc == 2 && !wcscmp(argv[1], L"distribution-selfcheck"))
        return distribution_selfcheck();
    if (argc != 4 || wcscmp(argv[1], L"scan")) {
        fputs("{\"ok\":false,\"checked\":0,\"violations\":[],\"engine\":\"Objective-C + x64 assembly\","
            "\"error\":\"Usage: guard-integrity.exe scan MANIFEST ROOT | distribution PUBLIC_LIST PRIVATE_LIST | distribution-selfcheck\"}\n", stdout);
        return 1;
    }
    GuardIntegrity *scanner = (GuardIntegrity *)class_createInstance(objc_getClass("GuardIntegrity"), 0);
    if (!scanner) {
        fputs("{\"ok\":false,\"checked\":0,\"violations\":[],\"engine\":\"Objective-C + x64 assembly\","
            "\"error\":\"Cannot allocate Objective-C scanner\"}\n", stdout);
        return 1;
    }
    int result = [scanner scanManifest:argv[2] root:argv[3]];
    object_dispose(scanner);
    return result;
}
