//! spool#219 spike: render a Dioxus Native (RSX) app headlessly to a PNG with Blitz.
//! The app lives in design/app.rs (`pub fn App() -> Element`).
//! args: <out.png> <width> <height> [wait ms] [click x,y ...]
use anyrender::{PaintScene as _, render_to_buffer};
use anyrender_vello_cpu::VelloCpuImageRenderer;
use blitz_dom::{Document as _, util::Color};
use blitz_net::Provider;
use blitz_paint::paint_scene;
use blitz_traits::shell::ColorScheme;
use dioxus_native::prelude::*;
use peniko::Fill;
use peniko::kurbo::Rect;
use std::sync::Arc;
use std::time::{Duration, Instant};

#[path = "../design/app.rs"]
mod app;

#[tokio::main]
async fn main() {
    let a: Vec<String> = std::env::args().collect();
    let out = a[1].clone();
    let width: u32 = a[2].parse().unwrap();
    let height: u32 = a[3].parse().unwrap();
    let wait: u64 = a.get(4).and_then(|s| s.parse().ok()).unwrap_or(1500);
    let clicks: Vec<(f32, f32)> = a.iter().skip(5).filter_map(|s| { let (x, y) = s.split_once(',')?; Some((x.parse().ok()?, y.parse().ok()?)) }).collect();
    let net = Arc::new(Provider::new(None));
    let vdom = VirtualDom::new(app::App);
    let mut h = blitz_test_harness::Harness::from_vdom(vdom, blitz_test_harness::HarnessOptions {
        width, height, scale: 1.0, color_scheme: ColorScheme::Light, base_url: None,
        net_provider: Some(Arc::clone(&net) as _),
    });
    let t0 = Instant::now();
    let mut clicked = 0;
    while t0.elapsed() < Duration::from_millis(wait) || !net.is_empty() {
        h.tick(0.016);
        if clicked < clicks.len() && t0.elapsed() > Duration::from_millis(wait * (clicked as u64 + 1) / (clicks.len() as u64 + 1)) {
            let (x, y) = clicks[clicked];
            h.click_at(x, y);
            clicked += 1;
        }
        if t0.elapsed() > Duration::from_millis(wait + 10_000) { break; }
        tokio::time::sleep(Duration::from_millis(16)).await;
    }
    let mut doc = h.into_inner();
    let buffer = render_to_buffer::<VelloCpuImageRenderer, _>(|scene| {
        scene.fill(Fill::NonZero, Default::default(), Color::WHITE, Default::default(), &Rect::new(0.0, 0.0, width as f64, height as f64));
        paint_scene(scene, &mut *doc.inner_mut(), 1.0, width, height, 0, 0);
    }, width, height);
    let f = std::fs::File::create(&out).unwrap();
    let mut enc = png::Encoder::new(f, width, height);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    let mut w = enc.write_header().unwrap();
    w.write_image_data(&buffer).unwrap();
    w.finish().unwrap();
    println!("wrote {out}");
}
