import { useEffect, useState } from 'react'

export default function Dashboard({ user }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const fetchDashboard = async () => {
    setError('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/dashboard', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Request failed')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError('Could not load dashboard data')
    }
  }

  useEffect(() => {
    fetchDashboard()
  }, [])

  return (
    <div className="dashboard-page">
      <h1>Dashboard</h1>
      <p>Welcome, {user?.username}.</p>

      {error && <p className="error">{error}</p>}

      {data && (
        <div className="instance-card">
          <p>Served by instance: <b>{data.instance || 'unknown (running locally)'}</b></p>
          <p>Computed stat: {data.computedStat.toFixed(2)}</p>
        </div>
      )}

      <button onClick={fetchDashboard}>Refresh</button>
    </div>
  )
}
