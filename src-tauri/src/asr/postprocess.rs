//! Turns raw whisper segments into lyric lines: UTF-8 token merging, line
//! splitting, hallucination filtering, optional Traditional→Simplified
//! conversion and LRC serialisation (with per-word timestamps).

#[derive(Debug, Clone)]
pub struct RawToken {
    pub bytes: Vec<u8>,
    /// Seconds; negative when unknown.
    pub t0: f64,
    #[allow(dead_code)]
    pub t1: f64,
}

#[derive(Debug, Clone)]
pub struct RawSegment {
    pub start: f64,
    pub end: f64,
    pub text: String,
    pub no_speech: f32,
    pub tokens: Vec<RawToken>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Word {
    pub start: f64,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Line {
    pub start: f64,
    pub end: f64,
    pub text: String,
    pub words: Vec<Word>,
}

/// Phrases Whisper tends to invent over music / silence.
const HALLUCINATIONS: &[&str] = &[
    "字幕由", "字幕提供", "字幕志愿者", "中文字幕", "请不吝点赞", "订阅", "点赞", "打赏", "谢谢观看",
    "感谢观看", "明镜与点点栏目", "优优独播剧场", "YoYo Television", "Amara.org", "字幕by", "索兰娅",
    "Thank you for watching", "Thanks for watching", "Please subscribe", "Subtitles by",
    "ご視聴ありがとうございました", "チャンネル登録",
];

const BREAK_PUNCT: &[char] = &['，', '。', '！', '？', '；', '、', ',', '.', '!', '?', ';', '…', '～', '~'];
const TRIM_PUNCT: &[char] = &[
    '，', '。', '！', '？', '；', '、', ',', '.', '!', '?', ';', '…', '～', '~', '"', '“', '”', '「', '」',
    '(', ')', '（', '）', '-', '—', '♪', '♫', '*', ' ',
];

fn is_cjk(c: char) -> bool {
    matches!(c as u32, 0x3040..=0x30FF | 0x3400..=0x4DBF | 0x4E00..=0x9FFF | 0xAC00..=0xD7AF | 0xF900..=0xFAFF)
}

fn is_hallucination(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return true;
    }
    if !t.chars().any(|c| c.is_alphanumeric()) {
        return true; // only symbols like "♪♪" or "..."
    }
    let lower = t.to_lowercase();
    HALLUCINATIONS.iter().any(|h| lower.contains(&h.to_lowercase()))
}

/// Merges tokens whose bytes only form valid UTF-8 together (CJK characters are
/// frequently split across tokens).
fn pieces(seg: &RawSegment) -> Vec<Word> {
    let mut out = Vec::new();
    let mut buf: Vec<u8> = Vec::new();
    let mut start = -1.0;
    for tok in &seg.tokens {
        if buf.is_empty() {
            start = tok.t0;
        }
        buf.extend_from_slice(&tok.bytes);
        if let Ok(s) = std::str::from_utf8(&buf) {
            if !s.is_empty() {
                out.push(Word { start, text: s.to_string() });
            }
            buf.clear();
        }
    }
    if !buf.is_empty() {
        out.push(Word { start, text: String::from_utf8_lossy(&buf).into_owned() });
    }
    // Fix missing or out-of-range timestamps by spreading across the segment.
    let n = out.len().max(1) as f64;
    let span = (seg.end - seg.start).max(0.01);
    for (i, w) in out.iter_mut().enumerate() {
        if !(w.start >= seg.start - 0.5 && w.start <= seg.end + 0.5) {
            w.start = seg.start + span * i as f64 / n;
        }
        w.start = w.start.clamp(seg.start, seg.end);
    }
    // Keep timestamps monotonic.
    for i in 1..out.len() {
        if out[i].start < out[i - 1].start {
            out[i].start = out[i - 1].start;
        }
    }
    out
}

fn visual_len(s: &str) -> usize {
    s.chars().map(|c| if is_cjk(c) { 2 } else { 1 }).sum()
}

fn finish_line(words: &mut Vec<Word>, end: f64, lines: &mut Vec<Line>) {
    if words.is_empty() {
        return;
    }
    let mut ws: Vec<Word> = std::mem::take(words);
    // Trim punctuation from the edges but keep inner spacing.
    if let Some(first) = ws.first_mut() {
        first.text = first.text.trim_start_matches(TRIM_PUNCT).to_string();
    }
    if let Some(last) = ws.last_mut() {
        last.text = last.text.trim_end_matches(TRIM_PUNCT).to_string();
    }
    ws.retain(|w| !w.text.is_empty());
    let text: String = ws.iter().map(|w| w.text.as_str()).collect::<String>().trim().to_string();
    if text.is_empty() || is_hallucination(&text) {
        return;
    }
    let start = ws.first().map(|w| w.start).unwrap_or(end);
    lines.push(Line { start, end: end.max(start), text, words: ws });
}

pub fn build_lines(segments: &[RawSegment]) -> Vec<Line> {
    let mut lines = Vec::new();
    for seg in segments {
        if seg.no_speech > 0.85 || is_hallucination(&seg.text) {
            continue;
        }
        let ps = pieces(seg);
        let mut cur: Vec<Word> = Vec::new();
        let mut cur_len = 0usize;
        for (i, p) in ps.iter().enumerate() {
            let next_start = ps.get(i + 1).map(|n| n.start).unwrap_or(seg.end);
            let starts_word = p.text.starts_with(' ');
            let prev_start = cur.last().map(|w: &Word| w.start);
            if let Some(prev) = prev_start {
                let long_gap = p.start - prev > 2.5;
                let too_long = cur_len >= 36 && (starts_word || p.text.chars().any(is_cjk));
                if long_gap || too_long {
                    finish_line(&mut cur, p.start, &mut lines);
                    cur_len = 0;
                }
            }
            cur_len += visual_len(&p.text);
            cur.push(p.clone());
            if p.text.trim_end().ends_with(BREAK_PUNCT) {
                finish_line(&mut cur, next_start, &mut lines);
                cur_len = 0;
            }
        }
        finish_line(&mut cur, seg.end, &mut lines);
    }
    dedupe_loops(lines)
}

/// Whisper sometimes repeats a phrase many times in quick succession. Real
/// lyrics repeat too, so only collapse rapid-fire duplicates.
fn dedupe_loops(lines: Vec<Line>) -> Vec<Line> {
    let mut out: Vec<Line> = Vec::with_capacity(lines.len());
    let mut run = 0;
    for l in lines {
        if let Some(prev) = out.last() {
            if prev.text == l.text && l.start - prev.start < 1.5 {
                run += 1;
                if run >= 1 {
                    continue;
                }
            } else {
                run = 0;
            }
        }
        out.push(l);
    }
    out
}

pub fn to_simplified(lines: &mut [Line]) {
    for l in lines.iter_mut() {
        l.text = zhconv::zhconv(&l.text, zhconv::Variant::ZhHans);
        for w in l.words.iter_mut() {
            w.text = zhconv::zhconv(&w.text, zhconv::Variant::ZhHans);
        }
    }
}

pub fn fmt_ts(t: f64) -> String {
    let t = t.max(0.0);
    let cs = (t * 100.0).round() as u64;
    format!("{:02}:{:02}.{:02}", cs / 6000, (cs / 100) % 60, cs % 100)
}

pub fn to_lrc(lines: &[Line], title: Option<&str>, artist: Option<&str>, model: &str, words: bool) -> String {
    let mut out = String::new();
    if let Some(t) = title {
        out.push_str(&format!("[ti:{t}]\n"));
    }
    if let Some(a) = artist {
        out.push_str(&format!("[ar:{a}]\n"));
    }
    out.push_str(&format!("[re:LightPlayer AI ({model})]\n"));
    for l in lines {
        out.push_str(&format!("[{}]", fmt_ts(l.start)));
        if words && l.words.len() > 1 {
            for w in &l.words {
                out.push_str(&format!("<{}>{}", fmt_ts(w.start), w.text));
            }
            out.push_str(&format!("<{}>", fmt_ts(l.end)));
        } else {
            out.push_str(&l.text);
        }
        out.push('\n');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tok(s: &[u8], t: f64) -> RawToken {
        RawToken { bytes: s.to_vec(), t0: t, t1: t + 0.2 }
    }

    #[test]
    fn merges_split_utf8_and_splits_on_punctuation() {
        let ni = "你".as_bytes();
        let seg = RawSegment {
            start: 10.0,
            end: 14.0,
            text: "你好，世界。".into(),
            no_speech: 0.1,
            tokens: vec![
                tok(&ni[..1], 10.0),
                tok(&ni[1..], 10.1),
                tok("好，".as_bytes(), 10.5),
                tok("世界".as_bytes(), 12.0),
                tok("。".as_bytes(), 13.0),
            ],
        };
        let lines = build_lines(&[seg]);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].text, "你好");
        assert_eq!(lines[0].start, 10.0);
        assert_eq!(lines[1].text, "世界");
        assert_eq!(lines[1].start, 12.0);
    }

    #[test]
    fn filters_hallucinations_and_loops() {
        let mk = |text: &str, start: f64| RawSegment {
            start,
            end: start + 0.5,
            text: text.into(),
            no_speech: 0.1,
            tokens: vec![tok(text.as_bytes(), start)],
        };
        let lines = build_lines(&[
            mk("字幕由 Amara.org 社区提供", 0.0),
            mk("♪♪♪", 1.0),
            mk("啦啦啦", 5.0),
            mk("啦啦啦", 5.4),
            mk("啦啦啦", 5.8),
            mk("啦啦啦", 20.0),
        ]);
        let texts: Vec<_> = lines.iter().map(|l| (l.text.as_str(), l.start)).collect();
        assert_eq!(texts, vec![("啦啦啦", 5.0), ("啦啦啦", 20.0)]);
    }

    #[test]
    fn formats_lrc() {
        let lines = vec![Line {
            start: 65.432,
            end: 67.0,
            text: "hello world".into(),
            words: vec![
                Word { start: 65.432, text: "hello".into() },
                Word { start: 66.0, text: " world".into() },
            ],
        }];
        let lrc = to_lrc(&lines, Some("T"), None, "base", true);
        assert!(lrc.contains("[ti:T]"));
        assert!(lrc.contains("[01:05.43]<01:05.43>hello<01:06.00> world<01:07.00>"));
        let plain = to_lrc(&lines, None, None, "base", false);
        assert!(plain.contains("[01:05.43]hello world"));
    }

    #[test]
    fn converts_to_simplified() {
        let mut lines = vec![Line { start: 0.0, end: 1.0, text: "們說愛".into(), words: vec![] }];
        to_simplified(&mut lines);
        assert_eq!(lines[0].text, "们说爱");
    }
}
