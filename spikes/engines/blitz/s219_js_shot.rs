//! spool#219 spike: run a real spool frame document (React 19 TSX bundle) in Blitz with the Boa engine,
//! then screenshot it. Import map resolved by rewriting bare specifiers; http fetched with curl.
//! args: <frame url> <width> <height> <out.png> <wait ms>
use anyrender::{PaintScene as _, render_to_buffer};
use anyrender_vello_cpu::VelloCpuImageRenderer;
use blitz_dom::{DocumentConfig, util::Color};
use blitz_net::Provider;
use blitz_paint::paint_scene;
use blitz_traits::shell::{ColorScheme, Viewport};
use blitz_vibey_script::{FetchError, ScriptDocument, ScriptFetcher};
use blitz_dom::Document as _;
use peniko::Fill;
use peniko::kurbo::Rect;
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use url::Url;

fn curl(url: &str) -> Result<String, String> {
    let key: String = url.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '_' }).collect();
    let path = format!("/tmp/s219/jscache/{}", &key[key.len().saturating_sub(180)..]);
    if !url.contains("/p/") { if let Ok(s) = std::fs::read_to_string(&path) { return Ok(s); } }
    let r = curl_net(url);
    if let Ok(s) = &r { let _ = std::fs::create_dir_all("/tmp/s219/jscache"); let _ = std::fs::write(&path, s); }
    r
}
fn curl_net(url: &str) -> Result<String, String> {
    let o = std::process::Command::new("curl").args(["-sfL", "--max-time", "20", url]).output().map_err(|e| e.to_string())?;
    if !o.status.success() { return Err(format!("curl failed for {url}")); }
    String::from_utf8(o.stdout).map_err(|e| e.to_string())
}

fn rewrite(src: &str, map: &BTreeMap<String, String>, base: &Url, doc: &Url) -> String {
    // rewrite `from "x"`, `import "x"`, `import("x")` for bare specifiers in the map, and relative/absolute paths
    let mut out = String::with_capacity(src.len());
    let bytes = src.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i] as char;
        if c == '"' || c == '\'' {
            // find the previous non-space token
            let before = src[..i].trim_end();
            let is_spec = before.ends_with("from") || before.ends_with("import") || before.ends_with("import(");
            if let Some(end) = src[i + 1..].find(c) {
                let lit = &src[i + 1..i + 1 + end];
                if is_spec && !lit.contains('\n') {
                    let resolved = if let Some(v) = map.get(lit) {
                        doc.join(v).map(|u| u.to_string()).unwrap_or(lit.to_string())
                    } else if let Some((k, v)) = map.iter().find(|(k, _)| k.ends_with('/') && lit.starts_with(k.as_str())) {
                        doc.join(&format!("{}{}", v, &lit[k.len()..])).map(|u| u.to_string()).unwrap_or(lit.to_string())
                    } else if lit.starts_with('/') || lit.starts_with("./") || lit.starts_with("../") {
                        base.join(lit).map(|u| u.to_string()).unwrap_or(lit.to_string())
                    } else { lit.to_string() };
                    out.push(c); out.push_str(&resolved); out.push(c);
                    i += end + 2;
                    continue;
                }
            }
        }
        out.push(c);
        i += c.len_utf8();
        // keep i on a char boundary
        while i < bytes.len() && !src.is_char_boundary(i) { i += 1; }
    }
    out
}

struct HttpFetcher { map: BTreeMap<String, String>, doc: Url, log: std::rc::Rc<std::cell::RefCell<Vec<String>>> }
impl ScriptFetcher for HttpFetcher {
    fn fetch(&self, url: &Url) -> Result<String, FetchError> {
        let t = Instant::now();
        let body = curl(url.as_str()).map_err(FetchError::InvalidData)?;
        self.log.borrow_mut().push(format!("fetched {} ({} bytes, {} ms)", url, body.len(), t.elapsed().as_millis()));
        Ok(rewrite(&body, &self.map, url, &self.doc))
    }
}

#[tokio::main]
async fn main() {
    let a: Vec<String> = std::env::args().collect();
    let url = Url::parse(&a[1]).unwrap();
    let width: u32 = a[2].parse().unwrap();
    let height: u32 = a[3].parse().unwrap();
    let out = &a[4];
    let wait: u64 = a[5].parse().unwrap();
    let t0 = Instant::now();
    let mut html = curl(url.as_str()).unwrap();
    // import map
    let mut map = BTreeMap::new();
    if let Some(s) = html.find("<script type=\"importmap\">") {
        let s2 = s + "<script type=\"importmap\">".len();
        let e = s2 + html[s2..].find("</script>").unwrap();
        let json = &html[s2..e];
        let imports = &json[json.find("\"imports\":").unwrap() + 10..];
        for part in imports.trim_start_matches('{').split("\",\"") {
            let kv: Vec<&str> = part.trim_matches(|c| c == '"' || c == '}' ).splitn(2, "\":\"").collect();
            if kv.len() == 2 { map.insert(kv[0].trim_matches('"').to_string(), kv[1].trim_matches(|c| c == '"' || c == '}').to_string()); }
        }
        html.replace_range(s..e + 9, "");
    }
    // rewrite inline module scripts
    let mut rebuilt = String::new();
    let mut rest = html.as_str();
    while let Some(p) = rest.find("<script type=\"module\">") {
        let q = p + "<script type=\"module\">".len();
        let e = q + rest[q..].find("</script>").unwrap();
        rebuilt.push_str(&rest[..q]);
        rebuilt.push_str(&rewrite(&rest[q..e], &map, &url, &url));
        rest = &rest[e..];
    }
    rebuilt.push_str(rest);
    let still = "<style>*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style></head>";
    let shims = std::fs::read_to_string("/tmp/s219/blitz-shims.js").unwrap_or_default();
    let rebuilt = rebuilt.replacen("</head>", still, 1).replacen("<head>", &format!("<head><script>{shims}</script>"), 1);
    let log = std::rc::Rc::new(std::cell::RefCell::new(Vec::new()));
    let net = Arc::new(Provider::new(None));
    let mut doc = ScriptDocument::from_html(&rebuilt, DocumentConfig {
        base_url: Some(url.to_string()),
        net_provider: Some(Arc::clone(&net) as _),
        viewport: Some(Viewport::new(width, height, 1.0, ColorScheme::Light)),
        ..Default::default()
    }).without_timer_thread().with_fetcher(HttpFetcher { map, doc: url.clone(), log: log.clone() });
    let t_parse = t0.elapsed();
    let t_x = Instant::now();
    doc.execute_scripts();
    let t_exec = t_x.elapsed();
    // first paint-ready: poll until #root has children
    let t_r = Instant::now();
    let mut first_ms = 0u128;
    for _ in 0..2000 { doc.poll(None); doc.inner_mut().resolve(0.0);
        let has = { let d = doc.inner(); d.query_selector("#root > *").ok().flatten().is_some() };
        if has { first_ms = t_r.elapsed().as_millis(); break; } std::thread::sleep(Duration::from_millis(2)); }
    let deadline = Instant::now() + Duration::from_millis(wait);
    let mut polls = 0;
    while Instant::now() < deadline {
        doc.poll(None);
        doc.inner_mut().resolve(0.0);
        polls += 1;
        std::thread::sleep(Duration::from_millis(8));
    }
    loop { doc.inner_mut().resolve(0.0); if net.is_empty() { break; } std::thread::sleep(Duration::from_millis(5)); }
    let buffer = render_to_buffer::<VelloCpuImageRenderer, _>(|scene| {
        scene.fill(Fill::NonZero, Default::default(), Color::WHITE, Default::default(), &Rect::new(0.0, 0.0, width as f64, height as f64));
        paint_scene(scene, &mut *doc.inner_mut(), 1.0, width, height, 0, 0);
    }, width, height);
    let f = std::fs::File::create(out).unwrap();
    let mut enc = png::Encoder::new(f, width, height);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    let mut w = enc.write_header().unwrap();
    w.write_image_data(&buffer).unwrap();
    w.finish().unwrap();
    if let Ok(code) = std::env::var("S219_EVAL") { doc.eval(&code); doc.poll(None); }
    for l in log.borrow().iter() { eprintln!("{l}"); }
    for m in doc.take_messages() { eprintln!("console: {}", m.chars().take(300).collect::<String>()); }
    { let d = doc.inner(); if let Ok(Some(id)) = d.query_selector("html") { if let Some(el)=d.get_node(id).and_then(|n| n.element_data()) { for a in el.attrs() { if (&*a.name.local).starts_with("data-s219") { eprintln!("attr {}: {}", &*a.name.local, a.value.chars().take(1500).collect::<String>()); } } } } }
    for e in doc.take_js_errors() { eprintln!("js error: {}", e.chars().take(600).collect::<String>()); }
    println!("{{\"parse_ms\":{},\"exec_ms\":{},\"root_ms\":{},\"polls\":{}}}", t_parse.as_millis(), t_exec.as_millis(), first_ms, polls);
}
