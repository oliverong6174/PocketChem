const h = { "User-Agent": "PocketChem-eval/1.0" };
const r = await fetch("https://api.github.com/repos/openstax/osbooks-organic-chemistry/contents/", { headers: h });
console.log(r.status); const j = await r.json(); console.log(Array.isArray(j) ? j.map((x) => x.name).join(", ") : JSON.stringify(j).slice(0, 300));
const r2 = await fetch("https://raw.githubusercontent.com/openstax/osbooks-organic-chemistry/main/collections/organic-chemistry.collection.xml", { headers: h }); console.log(r2.status, (await r2.text()).length);
