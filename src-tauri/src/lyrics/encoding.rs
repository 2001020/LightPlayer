//! Text decoding for lyric files: UTF-8/UTF-16 with BOM, plain UTF-8, then a
//! chardetng guess (GBK / Big5 / Shift-JIS are common for Chinese/Japanese LRC).

pub fn decode(bytes: &[u8]) -> String {
    if let Some((enc, bom_len)) = encoding_rs::Encoding::for_bom(bytes) {
        let (text, _) = enc.decode_without_bom_handling(&bytes[bom_len..]);
        return text.into_owned();
    }
    if let Ok(s) = std::str::from_utf8(bytes) {
        return s.to_string();
    }
    let mut det = chardetng::EncodingDetector::new(chardetng::Iso2022JpDetection::Deny);
    det.feed(bytes, true);
    let enc = det.guess(Some(b"cn"), chardetng::Utf8Detection::Allow);
    let (text, _, _) = enc.decode(bytes);
    text.into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_utf8_and_bom() {
        assert_eq!(decode("[00:01.00]你好".as_bytes()), "[00:01.00]你好");
        let mut bom = vec![0xEF, 0xBB, 0xBF];
        bom.extend_from_slice("歌词".as_bytes());
        assert_eq!(decode(&bom), "歌词");
    }

    #[test]
    fn decodes_gbk() {
        let (gbk, _, _) = encoding_rs::GBK.encode("[00:12.34]故事的小黄花，从出生那年就飘着");
        assert_eq!(decode(&gbk), "[00:12.34]故事的小黄花，从出生那年就飘着");
    }
}
