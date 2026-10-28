// Relances automatiques — à planifier une fois par jour (Dokploy › Schedules, dans le conteneur) :
//   node /app/scripts/send-reminders.mjs
// Appelle la route interne protégée par CRON_SECRET.
const port = process.env.PORT || 3100;
const res = await fetch(`http://127.0.0.1:${port}/api/cron/reminders`, {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
});
const body = await res.text();
console.log(`${res.status} ${body}`);
process.exit(res.ok ? 0 : 1);
