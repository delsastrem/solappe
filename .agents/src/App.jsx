import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";

function App() {
  const [user, setUser] = useState(undefined);
  const [esAdmin, setEsAdmin] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const snap = await getDoc(doc(db, "empleados", u.uid));
        if (snap.exists()) {
          setEsAdmin(snap.data().esAdmin === true);
        }
      } else {
        setEsAdmin(false);
      }
      setCargando(false);
    });
    return unsub;
  }, []);

  if (cargando) return <p style={{ padding: 20 }}>Cargando...</p>;

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            !user ? <Login /> :
            esAdmin ? <Navigate to="/admin" /> :
            <Navigate to="/dashboard" />
          }
        />
        <Route
          path="/dashboard"
          element={user && !esAdmin ? <Dashboard /> : <Navigate to="/" />}
        />
        <Route
          path="/admin"
          element={user && esAdmin ? <Admin /> : <Navigate to="/" />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;