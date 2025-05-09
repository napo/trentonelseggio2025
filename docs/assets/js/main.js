      const protocol = new pmtiles.Protocol();
      maplibregl.addProtocol("pmtiles", protocol.tile);
      const map = new maplibregl.Map({
        container: "map",
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: [11.121, 46.07],
        zoom: 10
      });
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
      let hoverPopup = null;
      let currentCandidateId = null;
      const votesByCandidate = {};
      const candidateMeta = {};
      let allData = [], uniqueMayors = new Set(), uniqueLists = new Set(), uniqueCandidates = new Set();
      const districtVotesByType = { mayor: {}, list: {}, candidate: {} };

      function updateMapByFilter(type, value) {
        if (!value) return;
        const filtered = allData.filter(i => {
          return type === "mayor" ? i.supportedmayor === value :
            type === "list" ? i.group === value :
              `${i.lastname} ${i.name}` === value;
        });
        const sectionVotes = {};
        filtered.forEach(i => {
          sectionVotes[i.idSection] = (sectionVotes[i.idSection] || 0) + i.votes;
        });
        if (!Object.keys(sectionVotes).length) return;
        const maxVotes = Math.max(...Object.values(sectionVotes));
        const stops = Object.entries(sectionVotes).map(([id, v]) => {
          let color = "hsl(240, 100%, 90%)";
          const ratio = v / maxVotes;
          if (ratio > 0.66) color = "hsl(240, 100%, 50%)";
          else if (ratio > 0.33) color = "hsl(240, 100%, 75%)";
          return [parseInt(id), color];
        });
        const opacityStops = Object.entries(sectionVotes).map(([id, v]) => [parseInt(id), v > 0 ? 0.6 : 0.0]);
        const idList = Object.keys(sectionVotes).map(k => parseInt(k));
        map.setPaintProperty("sezioni", "circle-color", ["match", ["get", "id_section"], ...stops.flat(), "#ccc"]);
        map.setFilter("sezioni", ["in", "id_section", ...idList]);
        map.setPaintProperty("sezioni", "circle-opacity", 0.6);
        map.setPaintProperty("sezioni", "circle-color", ["match", ["get", "id_section"], ...stops.flat(), "#ccc"]);
        map.setPaintProperty("sezioni", "circle-opacity", ["match", ["get", "id_section"], ...opacityStops.flat(), 0.0]);
        document.getElementById("mayor-input").disabled = type !== "mayor";
        document.getElementById("list-input").disabled = type !== "list";
        document.getElementById("candidate-input").disabled = type !== "candidate";
        const candidateInfo = document.getElementById("candidate-info");
        let infoHTML = "";
        if (type === "mayor") {
          const totalVotes = filtered.reduce((sum, i) => sum + i.votes, 0);
          const uniqueSections = new Set(filtered.map(i => i.idSection));
          infoHTML = `<strong>${value}</strong><br>Voti totali: ${totalVotes}<br>Sezioni con voto: ${uniqueSections.size}<br><small><strong>nota</strong>:<p>Il conteggio dei voti qui presente si basa esclusivamente sulle preferenze espresse per i candidati di lista e non quelle dirette</p></small>`;
        } else if (type === "list") {
          const mayor = filtered[0].supportedmayor;
          const totalVotes = filtered.reduce((sum, i) => sum + i.votes, 0);
          const uniqueSections = new Set(filtered.map(i => i.idSection));
          infoHTML = `<strong>${value}</strong><br>Sindaco: ${mayor}<br>Voti totali: ${totalVotes}<br>Sezioni con voto: ${uniqueSections.size}<br><small><strong>nota</strong>:<p>Il conteggio dei voti qui presente si basa esclusivamente sulle preferenze espresse per i candidati di lista e non quelle dirette</p></small>`;
        } else if (type === "candidate" && filtered.length > 0) {
          currentCandidateId = filtered[0].idCandidate;
          const item = filtered[0];
          const totalVotes = filtered.reduce((sum, i) => sum + i.votes, 0);
          const uniqueSections = new Set(filtered.map(i => i.idSection));
          const topSections = Object.entries(sectionVotes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, votes]) => {
            const perc = ((votes / totalVotes) * 100).toFixed(1);
            return `Sezione ${id}: ${votes} voti (${perc}%)`;
          }).join("<br>");
          infoHTML = `<strong>${item.lastname} ${item.name}</strong><br>Lista: ${item.group}<br>Sindaco: ${item.supportedmayor}<br>Voti totali: ${totalVotes}<br>Sezioni con voto: ${uniqueSections.size}<br><br><strong>Top sezioni:</strong><br>${topSections}`;
        }
        candidateInfo.innerHTML = infoHTML;
        if (window.innerWidth < 770) {
          const scrollBtn = document.getElementById("scroll-to-map-btn");
          if (scrollBtn) scrollBtn.style.display = "block";
        }
      }

      function updateDistrictColors(type, value) {
        const districtVotes = districtVotesByType[type][value];
        if (!districtVotes) return;

        const maxVotes = Math.max(...Object.values(districtVotes));
        const colorStops = Object.entries(districtVotes).map(([id, v]) => {
          let color = "hsl(240, 100%, 90%)";
          const ratio = v / maxVotes;
          if (ratio > 0.66) color = "hsl(240, 100%, 50%)";
          else if (ratio > 0.33) color = "hsl(240, 100%, 75%)";
          return [parseInt(id), color];
        });
        const opacityStops = Object.entries(districtVotes).map(([id, v]) => [
          parseInt(id),
          v > 0 ? 0.6 : 0.0
        ]);

        map.setPaintProperty("districts-layer", "fill-color",
          ["match", ["get", "id_district"], ...colorStops.flat(), "#ccc"]
        );

        map.setPaintProperty("districts-layer", "fill-opacity",
          ["match", ["get", "id_district"], ...opacityStops.flat(), 0.0]
        );

        // Fitting bounds dopo render
        map.once("idle", () => {
          const ids = Object.keys(districtVotes).map(id => parseInt(id)).filter(id => districtVotes[id] > 0);
          if (ids.length === 0) return;

          const source = map.getSource("districts");
          if (!source) return;

          map.querySourceFeatures("districts", { sourceLayer: "districts" }).forEach(f => {
            if (ids.includes(f.properties.id_district)) {
              if (!map.__bbox) {
                map.__bbox = turf.bbox(f);
              } else {
                map.__bbox = turf.bbox(turf.featureCollection([
                  turf.bboxPolygon(map.__bbox),
                  turf.bboxPolygon(turf.bbox(f))
                ]));
              }
            }
          });

          if (map.__bbox) {
            map.fitBounds(map.__bbox, { padding: 20 });
            map.__bbox = null;
          }
        });
      }

      map.on("load", () => {
        map.resize();
        map.addSource("sections", { type: "vector", url: "pmtiles://sections.pmtiles" });
        map.addLayer({
          id: "sezioni", type: "circle", source: "sections", "source-layer": "sections",
          paint: {
            "circle-color": "#ccc",
            "circle-opacity": 0.0,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 14, 3, 18, 6]
          }, layout: { visibility: "visible" }
        });
        map.addSource("districts", { type: "vector", url: "pmtiles://districts.pmtiles" });
        map.addLayer({
          id: "districts-layer", type: "fill", source: "districts", "source-layer": "districts",
          paint: {
            "fill-color": "rgba(0,0,0,0)",
            "fill-outline-color": "rgba(0,0,255,0.8)"
          }, layout: { visibility: "none" }
        });

        const radios = document.querySelectorAll('input[name="view-mode"]');
        function toggleLayerVisibility(view) {
          if (view === "sezioni") {
            map.setLayoutProperty("sezioni", "visibility", "visible");
            map.setLayoutProperty("districts-layer", "visibility", "none");
          } else if (view === "circoscrizioni") {
            map.setLayoutProperty("sezioni", "visibility", "none");
            map.setLayoutProperty("districts-layer", "visibility", "visible");
          }
        }
        radios.forEach(radio => {
          radio.addEventListener("change", e => toggleLayerVisibility(e.target.value));
        });
        toggleLayerVisibility("sezioni");


        protobuf.load("preferences_candidates.proto").then(root => {
          const Msg = root.lookupType("Preferences_candidatesList");
          return fetch("preferences_candidates.pbf")
            .then(res => res.arrayBuffer())
            .then(buf => {
              const decoded = Msg.decode(new Uint8Array(buf));
              allData = decoded.items.filter(item => item.votes > 0);
              allData.forEach(item => {
                const cid = item.idCandidate;
                const idDist = item.idDistrict;
                if (!votesByCandidate[cid]) votesByCandidate[cid] = {};
                votesByCandidate[cid][item.idSection] = item.votes;
                if (!districtVotesByType.mayor[item.supportedmayor]) districtVotesByType.mayor[item.supportedmayor] = {};
                if (!districtVotesByType.mayor[item.supportedmayor][idDist]) districtVotesByType.mayor[item.supportedmayor][idDist] = 0;
                districtVotesByType.mayor[item.supportedmayor][idDist] += item.votes;
                if (!districtVotesByType.list[item.group]) districtVotesByType.list[item.group] = {};
                if (!districtVotesByType.list[item.group][idDist]) districtVotesByType.list[item.group][idDist] = 0;
                districtVotesByType.list[item.group][idDist] += item.votes;
                const fullName = `${item.lastname} ${item.name}`;
                if (!districtVotesByType.candidate[fullName]) districtVotesByType.candidate[fullName] = {};
                if (!districtVotesByType.candidate[fullName][idDist]) districtVotesByType.candidate[fullName][idDist] = 0;
                districtVotesByType.candidate[fullName][idDist] += item.votes;
                candidateMeta[cid] = { id: cid, name: fullName, list: item.group, mayor: item.supportedmayor };
                uniqueMayors.add(item.supportedmayor);
                uniqueLists.add(item.group);
                uniqueCandidates.add(fullName);
              });
              ["mayor", "list", "candidate"].forEach(type => {
                const datalist = document.getElementById(`${type}-datalist`);
                datalist.innerHTML = "";
                const values = type === "mayor" ? [...uniqueMayors] : type === "list" ? [...uniqueLists] : [...uniqueCandidates];
                values.sort().forEach(v => datalist.appendChild(new Option(v, v)));
              });
            });
        });
      });

      map.on("mousemove", "districts-layer", function (e) {
        map.getCanvas().style.cursor = "pointer";
        const props = e.features[0].properties;
        const idDistrict = parseInt(props.id_district);
        const name = props.district; // <-- correzione qui
        const mayorVal = document.getElementById("mayor-input").value;
        const listVal = document.getElementById("list-input").value;
        const candidateVal = document.getElementById("candidate-input").value;
        let popupContent = "";
        let totalVotes = 0;

        if (candidateVal && districtVotesByType.candidate[candidateVal]?.[idDistrict]) {
          totalVotes = districtVotesByType.candidate[candidateVal][idDistrict];
          popupContent = `<strong>${candidateVal}</strong><br>Circoscrizione: ${name}<br>Voti: ${totalVotes}`;
        } else if (listVal && districtVotesByType.list[listVal]?.[idDistrict]) {
          totalVotes = districtVotesByType.list[listVal][idDistrict];
          popupContent = `<strong>${listVal}</strong><br>Circoscrizione: ${name}<br>Voti: ${totalVotes}`;
        } else if (mayorVal && districtVotesByType.mayor[mayorVal]?.[idDistrict]) {
          totalVotes = districtVotesByType.mayor[mayorVal][idDistrict];
          popupContent = `<strong>${mayorVal}</strong><br>Circoscrizione: ${name}<br>Voti: ${totalVotes}`;
        }

        if (!totalVotes) return;

        if (!hoverPopup) hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
        hoverPopup.setLngLat(e.lngLat).setHTML(popupContent).addTo(map);
      });


      map.on("mouseleave", "districts-layer", () => {
        map.getCanvas().style.cursor = "";
        if (hoverPopup) { hoverPopup.remove(); hoverPopup = null; }
      });


      map.on("mousemove", "sezioni", function (e) {
        map.getCanvas().style.cursor = "pointer";
        const props = e.features[0].properties;
        const idSection = parseInt(props.id_section);
        const mayorVal = document.getElementById("mayor-input").value;
        const listVal = document.getElementById("list-input").value;
        const candidateVal = document.getElementById("candidate-input").value;
        let popupContent = "";
        let sectionVotes = [];

        if (candidateVal) {
          sectionVotes = allData.filter(i => `${i.lastname} ${i.name}` === candidateVal && i.idSection === idSection);
          if (sectionVotes.length > 0) {
            const item = sectionVotes[0];
            popupContent = `<strong>${item.lastname} ${item.name}</strong><br>
                      Lista: ${item.group}<br>
                      Sindaco: ${item.supportedmayor}<br>
                      Sezione: ${idSection}<br>
                      Voti: ${item.votes}`;
          }
        } else if (listVal) {
          sectionVotes = allData.filter(i => i.group === listVal && i.idSection === idSection);
          const total = sectionVotes.reduce((sum, i) => sum + i.votes, 0);
          if (total > 0) {
            popupContent = `<strong>${listVal}</strong><br>
                      Sezione: ${idSection}<br>
                      Voti: ${total}`;
          }
        } else if (mayorVal) {
          sectionVotes = allData.filter(i => i.supportedmayor === mayorVal && i.idSection === idSection);
          const total = sectionVotes.reduce((sum, i) => sum + i.votes, 0);
          if (total > 0) {
            popupContent = `<strong>${mayorVal}</strong><br>
                      Sezione: ${idSection}<br>
                      Voti: ${total}`;
          }
        }

        if (!popupContent) return;
        if (!hoverPopup) hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
        hoverPopup.setLngLat(e.lngLat).setHTML(popupContent).addTo(map);
      });

      map.on("mouseleave", "sezioni", () => {
        map.getCanvas().style.cursor = "";
        if (hoverPopup) { hoverPopup.remove(); hoverPopup = null; }
      });


      ["mayor", "list", "candidate"].forEach(type => {
        document.getElementById(`${type}-input`).addEventListener("input", e => {
          updateMapByFilter(type, e.target.value);
          updateDistrictColors(type, e.target.value);
        });
      });

      document.getElementById("reset-button").addEventListener("click", () => {
        // Svuota gli input
        document.getElementById("mayor-input").value = "";
        document.getElementById("list-input").value = "";
        document.getElementById("candidate-input").value = "";

        // Riabilita tutti gli input
        document.getElementById("mayor-input").disabled = false;
        document.getElementById("list-input").disabled = false;
        document.getElementById("candidate-input").disabled = false;

        // Ripristina il contenuto del box informativo
        document.getElementById("candidate-info").innerHTML = "";

        // Rimuove il filtro e resetta i colori delle sezioni
        map.setFilter("sezioni", null);
        map.setPaintProperty("sezioni", "circle-color", "#ccc");
        map.setPaintProperty("sezioni", "circle-opacity", 0.0);

        // Reset colori distretti
        map.setPaintProperty("districts-layer", "fill-color", "rgba(0,0,0,0)");
        map.setPaintProperty("districts-layer", "fill-opacity", 0.0);

        // Reset visibilità: Sezioni visibili di default
        map.setLayoutProperty("sezioni", "visibility", "visible");
        map.setLayoutProperty("districts-layer", "visibility", "none");

        // Reset radio a "sezioni"
        document.getElementById("radio-sezioni").checked = true;

        // Zoom all'estensione massima dei distretti
        map.once("idle", () => {
          const source = map.getSource("districts");
          if (source?.type === "vector") {
            map.fitBounds([
              [10.99, 45.98],  // min lon, lat approssimativi
              [11.25, 46.14]   // max lon, lat approssimativi
            ], { padding: 20 });
          }
        });
      });

