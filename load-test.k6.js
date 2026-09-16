// k6 load test for the ICT305 auto-scaling demo — v8 (final tuned version).
//
// SETUP CHECKLIST — do this before every run:
//   1. In the console: Auto Scaling Group -> Edit group size -> Desired: 2
//      (start from the clean 2-instance baseline every time, not wherever
//      the previous test run left the group).
//   2. VERIFY (don't assume) pm2 cluster mode is actually active: SSH into
//      an instance and run `pm2 list` (expect 2 processes) or watch `htop`
//      during a short manual burst (expect BOTH cores climbing, not one
//      maxed + one idle). A single-threaded process on a 2-vCPU t3.micro
//      caps right around 50% instance CPU — which is consistent with the
//      48% previously observed, not enough headroom to reliably clear a
//      50% target-tracking threshold.
//   3. Check whether detailed (1-minute) CloudWatch monitoring is enabled
//      on the instances. Default is 5-minute granularity — if your ramp-up
//      and your sustained peak fall inside the same 5-minute bucket, the
//      reported average blends "still climbing" CPU with "saturated" CPU,
//      which can pull an otherwise-clean spike back under 50%. This is a
//      likely explanation for a near-miss like 48% specifically.
//
// LOAD PROFILE: 15 VUs, no sleep between requests, hitting the CPU-bound
// /api/dashboard endpoint (5M Math.sqrt() loop per request) continuously.
// Lowered from 25 -> 15 VUs. Your last full run at 25 VUs sustained
// 75-98% CPU (well above the 50% target-tracking threshold, with a lot of
// headroom to spare), so 15 is a deliberately gentler load that should
// still comfortably clear 50% and trigger scale-out, without hammering
// the instances as hard as the full 25-VU run did. If CPU comes in lower
// than expected (closer to the 50% line with little margin), that's the
// number to nudge back up rather than re-suspecting the infrastructure.
//
// TIMING: 1m ramp-up + 18m hold + 1m ramp-down = 20 minutes total.
// The ramp was lengthened back to 1 minute for a smoother climb into
// saturation (less abrupt than the earlier 20s version). The hold stays at
// 18 minutes to comfortably cover: new instance launch + boot + pass ALB
// health check + any ASG warm-up, leaving several clear minutes of plateau
// afterward. Expect three phases in the CPU graph: climb toward saturation
// on 2 instances -> drop and plateau lower once 4 instances are sharing
// load -> drop to baseline after the test ends.
//
// Well within the JWT's 2h expiry, so token expiry won't interfere.
//
// Run with:
//   k6 run load-test.k6.js
// Optional, to analyze per-instance request split afterward:
//   k6 run --out json=results.json load-test.k6.js
//   cat results.json | jq -r 'select(.metric=="dashboard_hits_by_instance") | .data.tags.instance' | sort | uniq -c

import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = 'http://ict305-alb-1468702606.ap-southeast-2.elb.amazonaws.com';

// Tracks which instance served each request, tagged by hostname, so you can
// confirm (not just infer from CPU graphs) that load actually spread across
// all 4 instances once scale-out completed.
const dashboardHits = new Counter('dashboard_hits_by_instance');

export const options = {
  stages: [
    { duration: '1m',  target: 15 }, // ramp — get to saturation, comfortably
                                      // inside a 5-min CW bucket either way
    { duration: '18m', target: 15 }, // hold — climb, scale-out, then plateau
    { duration: '1m',  target: 0 },  // ramp back down to 0
  ],
  thresholds: {
    http_req_failed: ['rate<0.10'],
  },
};

// setup() runs once before the load stages, not per-VU — perfect for logging in.
export function setup() {
  const res = http.post(
    `${BASE_URL}/api/login`,
    JSON.stringify({ username: 'demo', password: 'demo123' }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(res, { 'login succeeded': (r) => r.status === 200 });

  const token = res.json('token');
  if (!token) {
    throw new Error(`Login failed - cannot continue. Status: ${res.status}, body: ${res.body}`);
  }
  return { token };
}

// default() is what each virtual user repeatedly runs during the load stages.
export default function (data) {
  const res = http.get(`${BASE_URL}/api/dashboard`, {
    headers: { Authorization: `Bearer ${data.token}` },
  });

  const ok = check(res, { 'dashboard status is 200': (r) => r.status === 200 });

  if (ok) {
    const body = res.json();
    dashboardHits.add(1, { instance: body.instance });

    // Sample-log ~5% of requests so the terminal shows a readable trickle of
    // hostnames rather than flooding — watch for new hostnames appearing
    // partway through the hold stage, that's your scale-out evidence live.
    if (Math.random() < 0.05) {
      console.log(`served by: ${body.instance}`);
    }
  }
}
