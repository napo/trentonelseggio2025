// app.js

const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);
const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [11.121, 46.07],
  zoom: 13
});

let allData = [], votesByCandidate = {}, candidateMeta = {}, mapReady = false, initialViewSet = false;
let uniqueMayors = new Set(), uniqueLists = new Set(), uniqueCandidates = new Set();

map.on("load", () => {
  map.addSource("sections", {
    type: "vector",
    url: "pmtiles://sections.pmtiles"
  });

  map.addLayer({
    id: "sezioni",
    type: "circle",
    source: "sections",
    "source-layer": "sections",
    paint: {
      "circle-color": "#ccc",
      "circle-opacity": 0.6,
      "circle-radius": 6
    },
    filter: ["!", ["has", "__nonexistent__"]]
  });

  map.on("sourcedata", (e) => {
    if (e.sourceId === "sections" && e.isSourceLoaded && !initialViewSet) {
      const features = map.querySourceFeatures("sections", { sourceLayer: "sections" });
      if (features.length > 0) {
        const coords = features.map(f => f.geometry.coordinates);
        const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(c, c));
        map.fitBounds(bounds, { padding: 20 });
        initialViewSet = true;
      }
    }
  });

  mapReady = true;
});

protobuf.load("preferences_candidates.proto").then(root => {
  const Msg = root.lookupType("Preferences_candidatesList");
  return fetch("preferences_candidates.pbf")
    .then(res => res.arrayBuffer())
    .then(buf => {
      const decoded = Msg.decode(new Uint8Array(buf));
      allData = decoded.items.filter(item => item.votes > 0);

      allData.forEach(item => {
        const cid = item.idCandidate;
        if (!votesByCandidate[cid]) votesByCandidate[cid] = {};
        votesByCandidate[cid][item.idSection] = item.votes;
        candidateMeta[cid] = {
          id: cid,
          name: `${item.lastname} ${item.name}`,
          list: item.group,
          mayor: item.supportedmayor,
          group: item.group
        };
        uniqueMayors.add(item.supportedmayor);
        uniqueLists.add(item.group);
        uniqueCandidates.add(`${item.lastname} ${item.name}`);
      });

      populateInputs();
    });
});

function populateInputs() {
  const mayorDatalist = document.getElementById("mayor-datalist");
  const listDatalist = document.getElementById("list-datalist");
  const candidateDatalist = document.getElementById("candidate-datalist");

  mayorDatalist.innerHTML = "";
  listDatalist.innerHTML = "";
  candidateDatalist.innerHTML = "";

  [...uniqueMayors].sort().forEach(name => mayorDatalist.appendChild(new Option(name, name)));
  [...uniqueLists].sort().forEach(name => listDatalist.appendChild(new Option(name, name)));
  [...uniqueCandidates].sort().forEach(name => candidateDatalist.appendChild(new Option(name, name)));
}

function updateMapByFilter(type, value) {
  if (!value) return;
  let filtered = [];

  if (type === "mayor") {
    filtered = allData.filter(i => i.supportedmayor === value);
  } else if (type === "list") {
    filtered = allData.filter(i => i.group === value);
  } else if (type === "candidate") {
    filtered = allData.filter(i => `${i.lastname} ${i.name}` === value);
  }

  const sectionVotes = {};
  filtered.forEach(i => {
    sectionVotes[i.idSection] = (sectionVotes[i.idSection] || 0) + i.votes;
  });

  const maxVotes = Math.max(...Object.values(sectionVotes));
  const stops = Object.entries(sectionVotes).map(([id, v]) => [parseInt(id), `rgba(0, 0, 255, ${(v / maxVotes).toFixed(2)})`]);

  map.setPaintProperty("sezioni", "circle-color", [
    "match",
    ["get", "id_section"],
    ...stops.flat(),
    "#ccc"
  ]);

  map.setFilter("sezioni", ["in", "id_section", ...Object.keys(sectionVotes).map(k => parseInt(k))]);

  document.getElementById("mayor-input").disabled = type !== "mayor";
  document.getElementById("list-input").disabled = type !== "list";
  document.getElementById("candidate-input").disabled = type !== "candidate";
}

document.getElementById("reset-button").addEventListener("click", () => {
  map.setPaintProperty("sezioni", "circle-color", "#ccc");
  map.setFilter("sezioni", ["!", ["has", "__nonexistent__"]]);
  document.getElementById("mayor-input").value = "";
  document.getElementById("list-input").value = "";
  document.getElementById("candidate-input").value = "";
  document.getElementById("mayor-input").disabled = false;
  document.getElementById("list-input").disabled = false;
  document.getElementById("candidate-input").disabled = false;
});

["mayor", "list", "candidate"].forEach(type => {
  document.getElementById(`${type}-input`).addEventListener("input", e => {
    updateMapByFilter(type, e.target.value);
  });
});

map.on("mouseenter", "sezioni", (e) => {
  map.getCanvas().style.cursor = "pointer";
  const props = e.features[0].properties;
  const sid = parseInt(props.id_section);

  const match = allData.find(i => i.idSection === sid);
  if (!match) return;
  const name = `${match.lastname} ${match.name}`;

  const html = `
    <strong>${props.station} - Sezione ${props.id_section}</strong><br>
    <em>${props.district}</em><br>
    Sindaco: ${match.supportedmayor}<br>
    Lista: ${match.group}<br>
    Candidato: ${name}<br>
    Voti: ${match.votes}
  `;
  new maplibregl.Popup({ closeButton: false })
    .setLngLat(e.lngLat)
    .setHTML(html)
    .addTo(map);
});

map.on("mouseleave", "sezioni", () => {
  map.getCanvas().style.cursor = "";
  const popups = document.getElementsByClassName("maplibregl-popup");
  while (popups.length) popups[0].remove();
});

document.getElementById("toggle-sidebar").addEventListener("click", () => {
  const sidebar = document.getElementById("sidebar");
  sidebar.classList.toggle("hidden");
});
