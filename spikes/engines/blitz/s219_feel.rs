//! spool#219 feel bench: N documents of bench/anim.html, each resolved (style, animation, layout)
//! and painted to its own 390x300 buffer at 60 ticks/s for 5 s, on one thread, CPU raster (vello_cpu).
//! args: <html file> <N> [seconds]
use anyrender::{PaintScene as _, render_to_buffer};
use anyrender_vello_cpu::VelloCpuImageRenderer;
use blitz_dom::{DocumentConfig, util::Color};
use blitz_html::HtmlDocument;
use blitz_paint::paint_scene;
use blitz_traits::shell::{ColorScheme, Viewport};
use peniko::Fill;
use peniko::kurbo::Rect;
use std::time::{Duration, Instant};

fn cpu_s() -> f64 {
    let s = std::fs::read_to_string("/proc/self/stat").unwrap();
    let f: Vec<&str> = s.rsplit_once(") ").unwrap().1.split(' ').collect();
    (f[11].parse::<f64>().unwrap() + f[12].parse::<f64>().unwrap()) / 100.0
}
fn rss_mb() -> f64 {
    let s = std::fs::read_to_string("/proc/self/status").unwrap();
    s.lines().find(|l| l.starts_with("VmRSS")).unwrap().split_whitespace().nth(1).unwrap().parse::<f64>().unwrap() / 1024.0
}

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let html = std::fs::read_to_string(&a[1]).unwrap();
    let n: usize = a[2].parse().unwrap();
    let secs: f64 = a.get(3).and_then(|s| s.parse().ok()).unwrap_or(5.0);
    let (w, h) = (390u32, 300u32);
    let rss0 = rss_mb();
    let t_cold = Instant::now();
    let mut docs: Vec<HtmlDocument> = (0..n).map(|_| HtmlDocument::from_html(&html, DocumentConfig {
        viewport: Some(Viewport::new(w, h, 1.0, ColorScheme::Dark)), ..Default::default() })).collect();
    for d in docs.iter_mut() { d.as_mut().resolve(0.0); }
    let cold_ms = t_cold.elapsed().as_secs_f64() * 1000.0 / n as f64;
    let rss1 = rss_mb();
    let start = Instant::now();
    let c0 = cpu_s();
    let mut ticks = 0u32;
    let mut late = 0u32;
    let mut busy = 0.0f64;
    let mut worst = 0.0f64;
    while start.elapsed().as_secs_f64() < secs {
        let tick_start = Instant::now();
        let t = start.elapsed().as_secs_f64();
        for d in docs.iter_mut() {
            d.as_mut().resolve(t);
            let _buf = render_to_buffer::<VelloCpuImageRenderer, _>(|scene| {
                scene.fill(Fill::NonZero, Default::default(), Color::BLACK, Default::default(), &Rect::new(0.0, 0.0, w as f64, h as f64));
                paint_scene(scene, d.as_mut(), 1.0, w, h, 0, 0);
            }, w, h);
        }
        let dt = tick_start.elapsed().as_secs_f64() * 1000.0;
        busy += dt; worst = worst.max(dt); ticks += 1;
        if dt > 16.7 { late += 1; }
        let next = Duration::from_secs_f64(ticks as f64 / 60.0);
        if let Some(sl) = next.checked_sub(start.elapsed()) { std::thread::sleep(sl); }
    }
    let cpu = (cpu_s() - c0) / start.elapsed().as_secs_f64();
    println!("{{\"engine\":\"blitz\",\"N\":{n},\"coldMsPerDoc\":{:.1},\"msPerTick\":{:.2},\"worstTickMs\":{:.1},\"ticksOver16ms\":{late},\"ticks\":{ticks},\"cpuCores\":{:.2},\"rssMB\":{:.0},\"rssPerDocMB\":{:.1}}}",
        cold_ms, busy / ticks as f64, worst, cpu, rss_mb(), (rss1 - rss0) / n as f64);
}
