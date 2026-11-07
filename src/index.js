// Public Candidate Application Status Tracker
if (path === "/api/application-status" && request.method === "GET") {
  const suppliedPhone = cleanText(url.searchParams.get("phone"), 30);
  const digits = suppliedPhone.replace(/\D/g, "");

  if (digits.length < 10 || digits.length > 15) {
    return json(
      { error: "Valid registered mobile number enter karein." },
      400,
      cors
    );
  }

  const lastTen = digits.slice(-10);

  const r = await db(
    env,
    `applications?select=candidate_name,phone,created_at,status,jobs(title)&phone=ilike.*${encodeURIComponent(lastTen)}&order=created_at.desc&limit=100`
  );

  if (!r.ok) {
    return json(
      { error: "Application status load nahi ho saka. Thodi der baad try karein." },
      502,
      cors
    );
  }

  const rows = await r.json();

  const matched = rows.filter(row =>
    String(row.phone || "").replace(/\D/g, "").endsWith(lastTen)
  );

  return json(
    {
      applications: matched.map(row => ({
        candidate_name: row.candidate_name || "Candidate",
        job_title: row.jobs?.title || "General Application",
        application_date: row.created_at,
        status: row.status || "new"
      }))
    },
    200,
    {
      ...cors,
      "Cache-Control": "no-store"
    }
  );
}
