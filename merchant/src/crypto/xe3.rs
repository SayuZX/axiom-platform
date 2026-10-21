// X-E3 generator (MD5)

pub fn generate_x_e3(body: &str) -> String {
    let digest = md5::compute(body.as_bytes());
    format!("{:x}", digest)
}
