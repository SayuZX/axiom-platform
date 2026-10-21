/* Windows x64 ABI: RCX/RDX point to exactly 32 readable bytes.
 * No content-dependent branches or memory offsets; 1 equal, 0 different.
 */
.text
.p2align 4
.globl guard_equal32
.def guard_equal32; .scl 2; .type 32; .endef
.seh_proc guard_equal32
guard_equal32:
    .seh_endprologue
    movq 0(%rcx), %rax
    xorq 0(%rdx), %rax
    movq 8(%rcx), %r8
    xorq 8(%rdx), %r8
    orq %r8, %rax
    movq 16(%rcx), %r8
    xorq 16(%rdx), %r8
    orq %r8, %rax
    movq 24(%rcx), %r8
    xorq 24(%rdx), %r8
    orq %r8, %rax
    testq %rax, %rax
    sete %al
    movzbl %al, %eax
    ret
.seh_endproc
