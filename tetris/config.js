window.SUPABASE_URL = "https://pmgfmymtavhjfynoyupv.supabase.co";
// Anon key — now SELECT-only on the scores table (see anti-cheat.sql). It can
// read the leaderboard but cannot write, so it is safe to ship publicly.
window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtZ2ZteW10YXZoamZ5bm95dXB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0ODUyNDAsImV4cCI6MjA5NDA2MTI0MH0.It7fB4luoNyg2UfE9N86ICxjGFxtmVa5WLIBZriW7hQ";
// Edge-function base URL. Default derives from the project ref; override if you
// use a custom domain. All score writes go through these server-side functions.
window.ATS_FN_BASE = "https://pmgfmymtavhjfynoyupv.functions.supabase.co";
