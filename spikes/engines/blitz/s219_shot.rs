//! spool#219 spike: render an HTML file with Blitz at an exact viewport.
//! args: <html file> <base url> <width> <height> <out.png> [scale]
use anyrender::{PaintScene as _, render_to_buffer};
use anyrender_vello_cpu::VelloCpuImageRenderer;
use blitz_dom::{DocumentConfig, util::Color};
use blitz_html::HtmlDocument;
use blitz_net::Provider;
use blitz_paint::paint_scene;
use blitz_traits::shell::{ColorScheme, Viewport};
use peniko::Fill;
use peniko::kurbo::Rect;
use std::sync::Arc;
use std::time::Instant;

#[tokio::main]
async fn main() {
    let a: Vec<String> = std::env::args().collect();
    let html = std::fs::read_to_string(&a[1]).unwrap();
    let base = a[2].clone();
    let width: u32 = a[3].parse().unwrap();
    let height: u32 = a[4].parse().unwrap();
    let out = &a[5];
    let scale: f64 = a.get(6).and_then(|s| s.parse().ok()).unwrap_or(1.0);
    let t0 = Instant::now();
    let net = Arc::new(Provider::new(None));
    let mut document = HtmlDocument::from_html(
        &html,
        DocumentConfig {
            base_url: Some(base),
            net_provider: Some(Arc::clone(&net) as _),
            viewport: Some(Viewport::new(
                (width as f64 * scale) as u32,
                (height as f64 * scale) as u32,
                scale as f32,
                ColorScheme::Light,
            )),
            ..Default::default()
        },
    );
    let t_parse = t0.elapsed();
    loop {
        document.resolve(0.0);
        if net.is_empty() { break; }
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    let t_fetch = t0.elapsed();
    let t1 = Instant::now();
    document.as_mut().resolve(0.0);
    let t_resolve = t1.elapsed();
    let rw = (width as f64 * scale) as u32;
    let rh = (height as f64 * scale) as u32;
    let t2 = Instant::now();
    let buffer = render_to_buffer::<VelloCpuImageRenderer, _>(
        |scene| {
            scene.fill(Fill::NonZero, Default::default(), Color::WHITE, Default::default(), &Rect::new(0.0, 0.0, rw as f64, rh as f64));
            paint_scene(scene, document.as_mut(), scale, rw, rh, 0, 0);
        },
        rw, rh,
    );
    let t_paint = t2.elapsed();
    let f = std::fs::File::create(out).unwrap();
    let mut enc = png::Encoder::new(f, rw, rh);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    let mut w = enc.write_header().unwrap();
    w.write_image_data(&buffer).unwrap();
    w.finish().unwrap();
    println!("{{\"parse_ms\":{},\"fetched_ms\":{},\"resolve_ms\":{},\"paint_ms\":{}}}",
        t_parse.as_millis(), t_fetch.as_millis(), t_resolve.as_millis(), t_paint.as_millis());
}
