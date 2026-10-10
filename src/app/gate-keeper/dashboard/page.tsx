"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Movie { id: number; title: string; description: string | null; year: number | null; rating: string | null; duration: string | null; genre: string | null; language: string | null; type: string | null; director: string | null; cast: string | null; posterUrl: string | null; backdropUrl: string | null; videoUrl: string | null; category: string | null; featured: boolean | null; }
interface Slide { id: number; title: string; subtitle: string | null; imageUrl: string | null; movieId: number | null; sortOrder: number | null; active: boolean | null; }
interface Category { id: number; name: string; slug: string; sortOrder: number | null; }
interface Stats { movies: number; slides: number; categories: number; watchlistItems: number; }

type Tab = "overview" | "movies" | "slides" | "categories";

export default function AdminDashboard() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats>({ movies: 0, slides: 0, categories: 0, watchlistItems: 0 });
  const [movies, setMovies] = useState<Movie[]>([]);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showMovieForm, setShowMovieForm] = useState(false);
  const [showSlideForm, setShowSlideForm] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingMovie, setEditingMovie] = useState<Movie | null>(null);
  const [editingSlide, setEditingSlide] = useState<Slide | null>(null);
  const [msg, setMsg] = useState("");

  const [mTitle, setMTitle] = useState(""); const [mDesc, setMDesc] = useState(""); const [mYear, setMYear] = useState(2024); const [mRating, setMRating] = useState("8.0"); const [mDuration, setMDuration] = useState("2h 0m"); const [mGenre, setMGenre] = useState(""); const [mLang, setMLang] = useState("English"); const [mType, setMType] = useState("Movie"); const [mDirector, setMDirector] = useState(""); const [mCast, setMCast] = useState(""); const [mPoster, setMPoster] = useState(""); const [mBackdrop, setMBackdrop] = useState(""); const [mVideo, setMVideo] = useState(""); const [mCategory, setMCategory] = useState("trending"); const [mFeatured, setMFeatured] = useState(false);

  const [sTitle, setSTitle] = useState(""); const [sSubtitle, setSSubtitle] = useState(""); const [sImage, setSImage] = useState(""); const [sMovieId, setSMovieId] = useState<number | null>(null); const [sOrder, setSOrder] = useState(0); const [sActive, setSActive] = useState(true);

  const [cName, setCName] = useState(""); const [cSlug, setCSlug] = useState("");


  const loadData = useCallback(async () => {
    try {
      const [sr, mr, slr, cr] = await Promise.all([fetch("/api/admin/stats"), fetch("/api/movies?limit=100"), fetch("/api/admin/slides"), fetch("/api/categories")]);
      const [s, m, sl, c] = await Promise.all([sr.json(), mr.json(), slr.json(), cr.json()]);
      if (s && !s.error) setStats(s);
      if (Array.isArray(m)) setMovies(m);
      if (Array.isArray(sl)) setSlides(sl);
      if (Array.isArray(c)) setCategories(c);
    } catch (e) {
      console.error("Failed to load admin data", e);
    }
  }, []);

  // Verify the admin session, then load dashboard data.
  useEffect(() => {
    fetch("/api/admin/verify")
      .then((r) => r.json())
      .then((d) => {
        if (!d.valid) {
          router.push("/gate-keeper");
        } else {
          setAuthed(true);
          loadData();
        }
      })
      .catch(() => router.push("/gate-keeper"));
  }, [router, loadData]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const resetMovie = () => { setMTitle(""); setMDesc(""); setMYear(2024); setMRating("8.0"); setMDuration("2h 0m"); setMGenre(""); setMLang("English"); setMType("Movie"); setMDirector(""); setMCast(""); setMPoster(""); setMBackdrop(""); setMVideo(""); setMCategory("trending"); setMFeatured(false); setEditingMovie(null); };
  const resetSlide = () => { setSTitle(""); setSSubtitle(""); setSImage(""); setSMovieId(null); setSOrder(0); setSActive(true); setEditingSlide(null); };

  const editMovie = (m: Movie) => { setEditingMovie(m); setMTitle(m.title); setMDesc(m.description||""); setMYear(m.year||2024); setMRating(m.rating||"8.0"); setMDuration(m.duration||""); setMGenre(m.genre||""); setMLang(m.language||""); setMType(m.type||"Movie"); setMDirector(m.director||""); setMCast(m.cast||""); setMPoster(m.posterUrl||""); setMBackdrop(m.backdropUrl||""); setMVideo(m.videoUrl||""); setMCategory(m.category||"trending"); setMFeatured(m.featured||false); setShowMovieForm(true); };
  const editSlide = (s: Slide) => { setEditingSlide(s); setSTitle(s.title); setSSubtitle(s.subtitle||""); setSImage(s.imageUrl||""); setSMovieId(s.movieId); setSOrder(s.sortOrder||0); setSActive(s.active!==false); setShowSlideForm(true); };

  const saveMovie = async () => { const body = { title:mTitle,description:mDesc,year:mYear,rating:mRating,duration:mDuration,genre:mGenre,language:mLang,type:mType,director:mDirector,cast:mCast,posterUrl:mPoster,backdropUrl:mBackdrop,videoUrl:mVideo,category:mCategory,featured:mFeatured }; const url = editingMovie ? `/api/movies/${editingMovie.id}` : "/api/movies"; await fetch(url, { method: editingMovie?"PUT":"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) }); flash("Saved!"); resetMovie(); setShowMovieForm(false); loadData(); };
  const delMovie = async (id:number) => { if(!confirm("Delete?")) return; await fetch(`/api/movies/${id}`,{method:"DELETE"}); flash("Deleted"); loadData(); };
  const saveSlide = async () => { const body = { title:sTitle,subtitle:sSubtitle,imageUrl:sImage,movieId:sMovieId,sortOrder:sOrder,active:sActive }; const url = editingSlide ? `/api/slides/${editingSlide.id}` : "/api/slides"; await fetch(url, { method: editingSlide?"PUT":"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) }); flash("Saved!"); resetSlide(); setShowSlideForm(false); loadData(); };
  const delSlide = async (id:number) => { if(!confirm("Delete?")) return; await fetch(`/api/slides/${id}`,{method:"DELETE"}); flash("Deleted"); loadData(); };
  const saveCat = async () => { await fetch("/api/categories",{ method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:cName,slug:cSlug||cName.toLowerCase().replace(/\s+/g,"-")})}); flash("Saved!"); setCName(""); setCSlug(""); setShowCatForm(false); loadData(); };
  const delCat = async (id:number) => { if(!confirm("Delete?")) return; await fetch(`/api/categories?id=${id}`,{method:"DELETE"}); flash("Deleted"); loadData(); };

  if (!authed) return null;

  const labelStyle: React.CSSProperties = { display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 6 };

  return (
    <div style={{ background: "#000", minHeight: "100vh", color: "#fff", paddingBottom: 40 }}>
      {msg && <div style={{ position: "fixed", top: 20, right: 20, zIndex: 999, padding: "10px 20px", borderRadius: 12, background: "#fff", color: "#000", fontWeight: 800, fontSize: 12 }}>{msg}</div>}

      <header style={{ padding: "20px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900 }}>CineMax Admin</h1>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2, fontWeight: 600 }}>Control Panel</p>
        </div>
        <button onClick={() => fetch("/api/admin/logout",{method:"POST"}).then(() => router.push("/gate-keeper"))} style={{ padding: "10px 20px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Logout</button>
      </header>

      {/* Tabs */}
      <nav style={{ display: "flex", gap: 8, padding: "16px 20px", overflowX: "auto" }} className="hide-scrollbar">
        {(["overview","movies","slides","categories"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "10px 20px", borderRadius: 12, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", border: "none", cursor: "pointer", flexShrink: 0, background: tab===t ? "#fff" : "rgba(255,255,255,0.05)", color: tab===t ? "#000" : "rgba(255,255,255,0.4)" }}>{t}</button>
        ))}
      </nav>

      <main style={{ padding: "0 20px" }}>
        {/* === OVERVIEW === */}
        {tab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
            {[{l:"Movies",v:stats.movies},{l:"Slides",v:stats.slides},{l:"Categories",v:stats.categories},{l:"Watchlist",v:stats.watchlistItems}].map(s=>(
              <div key={s.l} className="detail-panel" style={{ textAlign: "center" }}>
                <p style={{ fontSize: 32, fontWeight: 900, marginBottom: 4 }}>{s.v}</p>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>{s.l}</p>
              </div>
            ))}
          </div>
        )}

        {/* === MOVIES === */}
        {tab === "movies" && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800 }}>Library ({movies.length})</h2>
              <button onClick={() => { resetMovie(); setShowMovieForm(true); }} style={{ padding: "10px 20px", borderRadius: 12, background: "#fff", color: "#000", fontWeight: 800, fontSize: 11, border: "none", cursor: "pointer" }}>+ Add</button>
            </div>

            {showMovieForm && (
              <div className="detail-panel" style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 20 }}>{editingMovie ? "Edit Movie" : "New Movie"}</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div><label style={labelStyle}>Title</label><input className="glass-input" value={mTitle} onChange={e=>setMTitle(e.target.value)} /></div>
                    <div><label style={labelStyle}>Category</label><select className="glass-input" value={mCategory} onChange={e=>setMCategory(e.target.value)}><option value="trending">Trending</option>{categories.map(c=><option key={c.id} value={c.slug}>{c.name}</option>)}</select></div>
                  </div>
                  <div><label style={labelStyle}>Synopsis</label><textarea className="glass-input" rows={3} value={mDesc} onChange={e=>setMDesc(e.target.value)} style={{ resize: "vertical", minHeight: 80 }} /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                    <div><label style={labelStyle}>Year</label><input type="number" className="glass-input" value={mYear} onChange={e=>setMYear(parseInt(e.target.value)||2024)} /></div>
                    <div><label style={labelStyle}>Rating ★</label><input className="glass-input" value={mRating} onChange={e=>setMRating(e.target.value)} /></div>
                    <div><label style={labelStyle}>Duration</label><input className="glass-input" value={mDuration} onChange={e=>setMDuration(e.target.value)} /></div>
                    <div><label style={labelStyle}>Type</label><select className="glass-input" value={mType} onChange={e=>setMType(e.target.value)}><option>Movie</option><option>Series</option><option>Anime</option></select></div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div><label style={labelStyle}>Director</label><input className="glass-input" value={mDirector} onChange={e=>setMDirector(e.target.value)} /></div>
                    <div><label style={labelStyle}>Genre</label><input className="glass-input" value={mGenre} onChange={e=>setMGenre(e.target.value)} placeholder="Action, Drama" /></div>
                  </div>
                  <div><label style={labelStyle}>Cast</label><input className="glass-input" value={mCast} onChange={e=>setMCast(e.target.value)} placeholder="Actor 1, Actor 2" /></div>
                  <div><label style={labelStyle}>Language</label><input className="glass-input" value={mLang} onChange={e=>setMLang(e.target.value)} /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <div><label style={labelStyle}>Poster URL</label><input className="glass-input" value={mPoster} onChange={e=>setMPoster(e.target.value)} /></div>
                    <div><label style={labelStyle}>Backdrop URL</label><input className="glass-input" value={mBackdrop} onChange={e=>setMBackdrop(e.target.value)} /></div>
                    <div><label style={labelStyle}>Video URL</label><input className="glass-input" value={mVideo} onChange={e=>setMVideo(e.target.value)} /></div>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={mFeatured} onChange={e=>setMFeatured(e.target.checked)} style={{ width: 18, height: 18 }} /><span style={{ fontSize: 12, fontWeight: 700 }}>Featured</span></label>
                  <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                    <button onClick={saveMovie} style={{ flex: 1, padding: "14px 0", borderRadius: 14, background: "#fff", color: "#000", fontWeight: 900, fontSize: 12, border: "none", cursor: "pointer" }}>Save</button>
                    <button onClick={() => { setShowMovieForm(false); resetMovie(); }} style={{ padding: "14px 24px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {movies.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, background: "rgba(20,20,20,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ width: 44, height: 60, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "#111" }}><img src={m.posterUrl||""} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2, fontWeight: 600 }}>{m.year} • {m.type} • {m.rating}★</p>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => editMovie(m)} style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "none", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✏️</button>
                    <button onClick={() => delMovie(m.id)} style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "none", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === SLIDES === */}
        {tab === "slides" && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800 }}>Hero Slides ({slides.length})</h2>
              <button onClick={() => { resetSlide(); setShowSlideForm(true); }} style={{ padding: "10px 20px", borderRadius: 12, background: "#fff", color: "#000", fontWeight: 800, fontSize: 11, border: "none", cursor: "pointer" }}>+ Add</button>
            </div>

            {showSlideForm && (
              <div className="detail-panel" style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 20 }}>{editingSlide ? "Edit Slide" : "New Slide"}</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div><label style={labelStyle}>Title</label><input className="glass-input" value={sTitle} onChange={e=>setSTitle(e.target.value)} /></div>
                  <div><label style={labelStyle}>Subtitle</label><input className="glass-input" value={sSubtitle} onChange={e=>setSSubtitle(e.target.value)} /></div>
                  <div><label style={labelStyle}>Image URL</label><input className="glass-input" value={sImage} onChange={e=>setSImage(e.target.value)} /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div><label style={labelStyle}>Link to Movie</label><select className="glass-input" value={sMovieId??""} onChange={e=>setSMovieId(e.target.value?parseInt(e.target.value):null)}><option value="">None</option>{movies.map(m=><option key={m.id} value={m.id}>{m.title}</option>)}</select></div>
                    <div><label style={labelStyle}>Sort Order</label><input type="number" className="glass-input" value={sOrder} onChange={e=>setSOrder(parseInt(e.target.value)||0)} /></div>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={sActive} onChange={e=>setSActive(e.target.checked)} style={{ width: 18, height: 18 }} /><span style={{ fontSize: 12, fontWeight: 700 }}>Active</span></label>
                  <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                    <button onClick={saveSlide} style={{ flex: 1, padding: "14px 0", borderRadius: 14, background: "#fff", color: "#000", fontWeight: 900, fontSize: 12, border: "none", cursor: "pointer" }}>Save</button>
                    <button onClick={() => { setShowSlideForm(false); resetSlide(); }} style={{ padding: "14px 24px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {slides.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, background: "rgba(20,20,20,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ width: 72, height: 44, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "#111" }}><img src={s.imageUrl||""} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2, fontWeight: 600 }}>Order: {s.sortOrder} • {s.active ? "Active" : "Inactive"}</p>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => editSlide(s)} style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "none", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✏️</button>
                    <button onClick={() => delSlide(s.id)} style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "none", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === CATEGORIES === */}
        {tab === "categories" && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800 }}>Categories ({categories.length})</h2>
              <button onClick={() => setShowCatForm(!showCatForm)} style={{ padding: "10px 20px", borderRadius: 12, background: "#fff", color: "#000", fontWeight: 800, fontSize: 11, border: "none", cursor: "pointer" }}>+ Add</button>
            </div>

            {showCatForm && (
              <div className="detail-panel" style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 20 }}>New Category</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div><label style={labelStyle}>Name</label><input className="glass-input" value={cName} onChange={e=>setCName(e.target.value)} /></div>
                  <div><label style={labelStyle}>Slug (optional)</label><input className="glass-input" value={cSlug} onChange={e=>setCSlug(e.target.value)} placeholder="auto-generated" /></div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <button onClick={saveCat} style={{ flex: 1, padding: "14px 0", borderRadius: 14, background: "#fff", color: "#000", fontWeight: 900, fontSize: 12, border: "none", cursor: "pointer" }}>Save</button>
                    <button onClick={() => setShowCatForm(false)} style={{ padding: "14px 24px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {categories.map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 14, background: "rgba(20,20,20,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2, fontWeight: 600 }}>/{c.slug}</p>
                  </div>
                  <button onClick={() => delCat(c.id)} style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "none", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>🗑️</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
