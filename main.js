const mysql = require('mysql');

// MySQL database connection configuration
const dbConfig = {
  host: 'localhost',
  user: 'your_username',
  password: 'your_password',
  database: 'your_database_name'
};

// Create a MySQL pool
const pool = mysql.createPool(dbConfig);

function initAutocomplete() {

  var directionsService = new google.maps.DirectionsService();

  const map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 28.644800, lng: 77.216721 },
    zoom: 6,
    mapTypeId: "roadmap",
  });

  const input = document.getElementById("pac-input");
  const searchBox = new google.maps.places.SearchBox(input);

  map.addListener("bounds_changed", () => {
    searchBox.setBounds(map.getBounds());
  });

  let markers = [];


  searchBox.addListener("places_changed", () => {
    const places = searchBox.getPlaces();

    if (places.length == 0) {
      return;
    }

    markers.forEach((marker) => {
      marker.setMap(null);
    });
    markers = [];

    const bounds = new google.maps.LatLngBounds();
    places.forEach((place) => {
      if (!place.geometry) {
        console.log("Returned place contains no geometry");
        return;
      }
      const icon = {
        url: place.icon,
        size: new google.maps.Size(71, 71),
        origin: new google.maps.Point(0, 0),
        anchor: new google.maps.Point(17, 34),
        scaledSize: new google.maps.Size(25, 25),
      };

      markers.push(
        new google.maps.Marker({
          map,
          icon,
          title: place.name,
          position: place.geometry.location,
        })
      );

      if (place.geometry.viewport) {
        bounds.union(place.geometry.viewport);
      } else {
        bounds.extend(place.geometry.location);
      }

    });
    map.fitBounds(bounds);

  });

  var table = [];

  function savePlaceData(place, completionStatus) {
    pool.getConnection((err, connection) => {
      if (err) {
        console.error('Error connecting to database: ' + err.stack);
        return;
      }

      // Prepare SQL query
      const query = 'INSERT INTO places (name, latitude, longitude, completion_status) VALUES (?, ?, ?, ?)';
      const values = [place.name, place.geometry.location.lat(), place.geometry.location.lng(), completionStatus];

      // Execute the query
      connection.query(query, values, (error, results, fields) => {
        // Release the connection
        connection.release();

        if (error) {
          console.error('Error saving place data: ' + error.message);
          return;
        }

        console.log('Place data saved successfully.');
      });
    });
  }

  document.getElementById("send-data").addEventListener('click', function () {
    if (input.value != "" && table.includes(input.value) == false) {

      table.push(input.value);

      const tableBody = document.getElementById('table-data');
      let dataHtml = '';
      for (let element of table) {
        dataHtml += '<tr id="' + element + '" > <td class="elemenet"> ' + element + ' </td> <td class="btn-delete" id="' + element + '" > <button class="btn-item"> ' + "Delete" + ' </button> </td> </tr>'
      }
      tableBody.innerHTML = dataHtml;

      document.querySelectorAll(".btn-delete").forEach(item => {
        item.addEventListener('click', event => {
          document.getElementById(item.id).remove();
          const valuesToRemove = [item.id];
          table = table.filter(table => !valuesToRemove.includes(table));
        })
      });

    }
    savePlaceData(place, false);

  });


  document.getElementById("calculate-btn").addEventListener('click', function () {

    if (table.length >= 2) {
      var request = [];
      for (let i = 0; i < table.length - 1; i++) {
        for (let j = 1; j < table.length - i; j++) {

          request.push({
            origin: table[i],
            destination: table[j + i],
            travelMode: google.maps.DirectionsTravelMode.DRIVING
          });

        }
      }

    } else {
      alert("You have no power HERE !");
    }

    var distance_table = [];
    var delayrequest = request.length * 30;
    for (let i = 0; i < request.length; i++) {

      setTimeout(function () {
        directionsService.route(request[i], function (response, status) {
          if (status == google.maps.DirectionsStatus.OK) {
            distance_table.push(Number(response.routes[0].legs[0].distance.value / 1000));

          } else {
            alert("Wrong item: " + table[i].toString() + " or " + table[j + i].toString());
          }

        });
      }, delayrequest * i);
    }


    setTimeout(function () {

      var n = table.length;
      var distance = new Array(n);
      for (let i = 0; i < n; i++) { distance[i] = new Array(n); }

      var k = 0;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          distance[i][i] = 999999999;
          distance[j][j] = 999999999;
          distance[i][j] = distance_table[k];
          distance[j][i] = distance_table[k];
          k++;
        }
      }


      var text_block_to_glp = "Minimize \nobj:";

      let num = 1;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          text_block_to_glp += " +" + distance[i][j] + " x" + num;
          num++;
        }
      }


      text_block_to_glp += "\n\nSubject To"

      num = 1;
      for (let i = 0; i < n; i++) {
        temp = "";
        for (let j = 0; j < n; j++) {
          temp += " +x" + num;
          num++;
        }
        text_block_to_glp += "\nogr1_" + i + ":" + temp + " = 1"
      }

      num = 1;
      for (let i = 0; i < n; i++) {
        temp = "";
        for (let j = 0; j < n; j++) {
          temp += " +x" + num;
          num = num + n;
        }
        num = i + 2;
        text_block_to_glp += "\nogr2_" + i + ":" + temp + " = 1"
      }

      if (n > 2) {
        num = 1;
        for (let i = 1; i < n; i++) {
          let k = 1;
          let temp = 0;
          for (let j = i; j < n; j++) {
            num += 1;
            temp = num + (n - 1) * k;
            text_block_to_glp += "\nog3_" + i + "_" + j + ": +x" + num + " +x" + temp + " <= 1";
            k++;
          }
          num += 1 + i;

        }
      }

      text_block_to_glp += "\n\nBounds"
      for (let i = 1; i < n * n + 1; i++) {
        text_block_to_glp += "\nx" + i + " <= 1";
      }

      text_block_to_glp += "\n\nGeneral\n"
      for (let i = 1; i < n * n + 1; i++) {
        text_block_to_glp += "x" + i + " ";
      }

      text_block_to_glp += "\n\nEnd"

      var lp = glp_create_prob();
      glp_read_lp_from_string(lp, null, text_block_to_glp);

      glp_scale_prob(lp, GLP_SF_AUTO);

      var smcp = new SMCP({ presolve: GLP_ON });
      glp_simplex(lp, smcp);

      var iocp = new IOCP({ presolve: GLP_ON });
      glp_intopt(lp, iocp);

      console.log(text_block_to_glp);

      console.log("obj: " + glp_mip_obj_val(lp));
      for (var i = 1; i <= glp_get_num_cols(lp); i++) {
        console.log(glp_get_col_name(lp, i) + " = " + glp_mip_col_val(lp, i));
      }

      var wyn = [];
      wyn.push(table[0])
      let itr = 0;
      for (let i = 0; i < n; i++) {
        for (let j = 1; j < n + 1; j++) {
          if (glp_mip_col_val(lp, itr + j) == 1) {
            wyn.push(table[j - 1]);
            itr = j * n - n;
            j = n + 1;
          }
        }
      }

      var loc = [];
      for (let i = 1; i < n; i++) {
        loc.push({ location: wyn[i] })
      }

      var directionsService = new google.maps.DirectionsService();
      const map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 52, lng: 19 },
        zoom: 6,
        mapTypeId: "roadmap",
      });

      document.getElementById("right-panel").innerHTML = "";

      const directionsRenderer = new google.maps.DirectionsRenderer({
        draggable: true,
        map,
        panel: document.getElementById("right-panel"),
      });

      directionsRenderer.addListener("directions_changed", () => {
        computeTotalDistance(directionsRenderer.getDirections());
      });

      displayRoute(
        wyn[0],
        wyn[0],
        loc,
        directionsService,
        directionsRenderer
      );


      function displayRoute(origin, destination, loc, service, display) {
        service.route(
          {
            origin: origin,
            destination: destination,
            waypoints: loc,
            travelMode: google.maps.TravelMode.DRIVING,
            avoidTolls: true,
          },
          (result, status) => {
            if (status === "OK") {
              display.setDirections(result);
            } else {
              alert("Could not display directions due to: " + status);
            }
          }
        );
      }

      function computeTotalDistance(result) {
        let total = 0;
        const myroute = result.routes[0];

        for (let i = 0; i < myroute.legs.length; i++) {
          total += myroute.legs[i].distance.value;
        }
        total = total / 1000;
        document.getElementById("total").innerHTML = total + " km";
      }

    }, delayrequest * request.length + 500);
  });




}
