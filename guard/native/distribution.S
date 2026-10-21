/* Windows x64 ABI:
 * int guard_distribution_path(const unsigned char *src, size_t length,
 *                             unsigned char *dst, size_t capacity);
 * 0 public candidate, 1 private name, 2 unsafe. Explicit inventory intersection
 * remains authoritative. dst receives ASCII-lowercase/slash canonical UTF-8
 * plus NUL on 0/1. Exact in-place operation allowed; other overlap unsupported.
 * No reads beyond length, no writes beyond capacity. UTF-8 and Windows device
 * validation are additionally performed by the caller. Never URL-decode paths.
 * The first component is the resource name, not a private directory heuristic.
 */
.text
.p2align 4
.globl guard_distribution_path
.def guard_distribution_path; .scl 2; .type 32; .endef
.seh_proc guard_distribution_path
guard_distribution_path:
    pushq %rbx
    .seh_pushreg %rbx
    pushq %rsi
    .seh_pushreg %rsi
    pushq %rdi
    .seh_pushreg %rdi
    pushq %r12
    .seh_pushreg %r12
    pushq %r13
    .seh_pushreg %r13
    pushq %r14
    .seh_pushreg %r14
    pushq %r15
    .seh_pushreg %r15
    .seh_endprologue
    testq %rcx, %rcx
    jz .Lunsafe
    testq %r8, %r8
    jz .Lunsafe
    testq %rdx, %rdx
    jz .Lunsafe
    cmpq $32766, %rdx
    ja .Lunsafe
    cmpq %rdx, %r9
    jbe .Lunsafe
    movq %r8, %r12
    movq %rdx, %r13
    xorl %r10d, %r10d
.Lnormalize:
    movzbl (%rcx,%r10), %eax
    cmpb $32, %al
    jb .Lunsafe
    cmpb $127, %al
    je .Lunsafe
    /* Literal '%' assets are valid; reject encoded-byte aliases at publication. */
    cmpb $'%', %al
    jne .Lnot_encoded
    leaq 2(%r10), %rdx
    cmpq %r13, %rdx
    jae .Lnot_encoded
    movzbl 1(%rcx,%r10), %edx
    cmpb $'0', %dl
    jb .Lnot_encoded
    cmpb $'9', %dl
    jbe .Lsecond_hex
    orb $32, %dl
    cmpb $'a', %dl
    jb .Lnot_encoded
    cmpb $'f', %dl
    ja .Lnot_encoded
.Lsecond_hex:
    movzbl 2(%rcx,%r10), %edx
    cmpb $'0', %dl
    jb .Lnot_encoded
    cmpb $'9', %dl
    jbe .Lunsafe
    orb $32, %dl
    cmpb $'a', %dl
    jb .Lnot_encoded
    cmpb $'f', %dl
    jbe .Lunsafe
.Lnot_encoded:
    cmpb $':', %al
    je .Lunsafe
    cmpb $'"', %al
    je .Lunsafe
    cmpb $'<', %al
    je .Lunsafe
    cmpb $'>', %al
    je .Lunsafe
    cmpb $'|', %al
    je .Lunsafe
    cmpb $'*', %al
    je .Lunsafe
    cmpb $'?', %al
    je .Lunsafe
    cmpb $'\\', %al
    jne .Lcase
    movb $'/', %al
.Lcase:
    cmpb $'A', %al
    jb .Lstore
    cmpb $'Z', %al
    ja .Lstore
    addb $32, %al
.Lstore:
    movb %al, (%r12,%r10)
    incq %r10
    cmpq %r13, %r10
    jb .Lnormalize
    movb $0, (%r12,%r13)
    xorl %r14d, %r14d /* sticky private-name result */
    xorl %r15d, %r15d /* completed components */
    xorl %r10d, %r10d /* next byte */
    xorl %r11d, %r11d /* component start */
.Lcomponent:
    cmpq %r13, %r10
    je .Lcomponent_end
    cmpb $'/', (%r12,%r10)
    je .Lcomponent_end
    incq %r10
    jmp .Lcomponent
.Lcomponent_end:
    movq %r10, %rbx
    subq %r11, %rbx
    jz .Lunsafe
    movzbl -1(%r12,%r10), %eax
    cmpb $'.', %al /* also rejects . and .. */
    je .Lunsafe
    cmpb $' ', %al
    je .Lunsafe
    leaq (%r12,%r11), %rsi
    testq %r15, %r15
    jz .Lnext_component
    /* Directory names like ui/server are public unless carrying Lua code. */
    cmpq $6, %rbx
    jne .Lserver_script
    cmpl $0x76726573, (%rsi)
    jne .Lserver_script
    cmpw $0x7265, 4(%rsi)
    jne .Lserver_script
    cmpl $0x61756c2e, -4(%r12,%r13)
    jne .Lserver_script
    movl $1, %r14d
.Lserver_script:
    /* sv_*.lua is a server script, not all Lua. */
    cmpq $7, %rbx
    jb .Lrules
    cmpw $0x7673, (%rsi)
    jne .Lrules
    cmpb $'_', 2(%rsi)
    jne .Lrules
    cmpl $0x61756c2e, -4(%rsi,%rbx)
    jne .Lrules
    movl $1, %r14d
.Lrules:
    leaq .Lprivate_rules(%rip), %rdi
.Lrule:
    movzbl (%rdi), %edx /* 0 exact, 1 prefix, 2 suffix, 255 end */
    cmpb $255, %dl
    je .Lnext_component
    movzbl 1(%rdi), %ecx
    leaq 2(%rdi), %r8
    leaq (%r8,%rcx), %rdi
    cmpq %rcx, %rbx
    jb .Lrule
    movq %rsi, %r9
    testl %edx, %edx
    jnz .Lnot_exact
    cmpq %rcx, %rbx
    jne .Lrule
.Lnot_exact:
    cmpl $2, %edx
    jne .Lmatch
    addq %rbx, %r9
    subq %rcx, %r9
.Lmatch:
    xorl %eax, %eax
.Lmatch_byte:
    movzbl (%r8,%rax), %edx
    cmpb %dl, (%r9,%rax)
    jne .Lrule
    incq %rax
    cmpq %rcx, %rax
    jb .Lmatch_byte
    movl $1, %r14d
.Lnext_component:
    incq %r15
    cmpq %r13, %r10
    je .Lfinish
    incq %r10
    movq %r10, %r11
    jmp .Lcomponent
.Lfinish:
    cmpq $2, %r15
    jb .Lunsafe /* resource/file required */
    movl %r14d, %eax
    jmp .Lreturn
.Lunsafe:
    movl $2, %eax
.Lreturn:
    popq %r15
    popq %r14
    popq %r13
    popq %r12
    popq %rdi
    popq %rsi
    popq %rbx
    ret
.seh_endproc

.section .rdata,"dr"
/* Lengths calculated by the assembler, never maintained separately. */
.macro rule mode, text
    .byte \mode, 992f-991f
991: .ascii "\text"
992:
.endm
.Lprivate_rules:
    rule 0, "server.lua"
    rule 0, "server_config"
    rule 0, "server_config.lua"
    rule 0, "secrets"
    rule 1, "secrets."
    rule 0, "credentials"
    rule 1, "credentials."
    rule 0, ".env"
    rule 1, ".env."
    rule 0, ".git"
    rule 0, "db"
    rule 0, "sql"
    rule 0, "backup"
    rule 0, "backups"
    rule 2, ".db"
    rule 2, ".sqlite"
    rule 2, ".sqlite3"
    rule 2, ".sql"
    rule 2, ".bak"
    rule 2, ".backup"
    rule 2, ".old"
    rule 2, ".zip"
    rule 2, ".7z"
    rule 2, ".rar"
    rule 2, ".tar"
    rule 2, ".gz"
    rule 2, ".tgz"
    rule 2, ".bz2"
    rule 2, ".xz"
    .byte 255
