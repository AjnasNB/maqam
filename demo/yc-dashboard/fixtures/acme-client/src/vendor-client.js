export async function createJob(payload, token) {
  const response = await fetch("https://api.acme.test/v1/jobs", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(`Acme request failed: ${response.status}`);
  return response.json();
}
