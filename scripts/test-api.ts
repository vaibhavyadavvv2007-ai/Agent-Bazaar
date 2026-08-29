async function main() {
  const res = await fetch("https://agentbazaar-gw1ufde44-vaibhavyadavvv2007-ais-projects.vercel.app/api/approvals");
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}
main().catch(console.error);
