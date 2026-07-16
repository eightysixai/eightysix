import { Link, Route, Routes } from "react-router";

function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <h1 className="text-4xl font-bold">PNL</h1>

      <Link
        to="/dashboard"
        className="mt-6 inline-block rounded-lg bg-white px-4 py-2 text-black"
      >
        Open dashboard
      </Link>
    </main>
  );
}

function DashboardPage() {
  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <h1 className="text-4xl font-bold">Dashboard</h1>

      <Link to="/" className="mt-6 inline-block underline">
        Return home
      </Link>
    </main>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
    </Routes>
  );
}

export default App;