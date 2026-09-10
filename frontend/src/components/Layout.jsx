import { Outlet, Link } from 'react-router-dom'

export default function Layout({ user, onLogout }) {
  return (
    <div className="layout">
      <header className="topbar">
        <Link to="/dashboard" className="brand">ICT305 Scalable Web App</Link>
        <div className="topbar-right">
          {user && <span className="username">Hi, {user.username}</span>}
          <button onClick={onLogout} className="logout-btn">Log out</button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
