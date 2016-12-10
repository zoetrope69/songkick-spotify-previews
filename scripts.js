const extensionName = '[Songkick Spotify Preview Extension] ';
const debug = true;
let artists = [];
const sidebarElement = document.querySelector('.container .secondary');
const loadingTracksPlaceholder = '<div class="loading">Loading...</div>';

function onlyOneTrackPlayingAtOnce() {
  document.addEventListener('play', function(e){
    var audios = document.getElementsByTagName('audio');
    for(var i = 0, len = audios.length; i < len;i++){
        if(audios[i] != e.target){
            audios[i].pause();
        }
    }
  }, true);
}

function handleError(error) {
  debug && console.error(extensionName + 'Error:', error);
}

function findArtistsInPage() {
  return new Promise((resolve, reject) => {

    var currentPath = window.location.pathname;
    var isArtistPage = currentPath.includes('/artists/');
    var isConcertPage = currentPath.includes('/concerts/');
    var isFestivalPage = currentPath.includes('/festivals/');

    if (isArtistPage) {
      const artist = document.querySelector('.artist-header h1').innerHTML;

      if (!artist) {
        return reject('Couldnt find any artists on the page');
      }

      artists = [artist];
      return resolve(artists);
    }

    if (isConcertPage) {
      // more than one artist
      let artistLinks = document.querySelectorAll('.line-up a');

      if (artistLinks.length <= 0) {
        // single artist
        artistLinks = document.querySelectorAll('.expanded-lineup-details .artist-info a:first-child');

        if (artistLinks.length <= 0) {
          // past sinle arist
          artistLinks = document.querySelectorAll('.event-header .summary a');

          if (artistLinks.length <= 0) {
            return reject('Couldnt find any artists on the page');
          }
        }
      }

      artists = [];

      for (let i = 0; i < artistLinks.length; ++i) {
        const artistLink = artistLinks[i];
        artists.push(artistLink.innerHTML.trim());
      }

      debug && console.info(extensionName + 'Artists found in page:', artists);
      resolve(artists);
    }

    if (isFestivalPage) {
      // more than one artist
      let artistLinks = document.querySelectorAll('.line-up a');

      if (artistLinks.length <= 0) {
        return reject('Couldnt find any artists on the page');
      }

      artists = [];

      for (let i = 0; i < artistLinks.length; ++i) {
        const artistLink = artistLinks[i];
        artists.push(artistLink.innerHTML);
      }

      debug && console.info(extensionName + 'Artists found in page:', artists);
      resolve(artists);
    }

    return reject('Couldnt find any artists on the page');
  });
}

function sanitizeArtists(artists) {
  return artists.map(artist => {
    artist = artist.toLowerCase(); // to lower case
    artist = artist.replace(/(US)/g, ''); // remove us modifier
    artist = artist.replace(/(UK)/g, ''); // remove uk modifier
    artist = artist.replace(/(dj set)/g, ''); // remove dj set info from name
    artist = artist.replace(/(official)/g, ''); // remove official info from name
    artist = artist.replace(/&amp;/g, '&'); // replace &amp; with &
    artist = artist.replace(/<span class="verified-artist"><\/span>/g, ''); // remove verified icon
    artist = artist.replace(/\./g, ''); // remove .s
    artist = artist.trim()
    return artist;
  });
}

function findArtist(query) {
  const url = 'https://api.spotify.com/v1/search' +
              `?q=${query}` +
              '&type=artist' +
              '&limit=1';

  debug && console.info(extensionName + 'Artists found in page:', artists);

  return new Promise((resolve, reject) => {
    return fetch(url)
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          return reject(data.error.message);
        }

        console.log(data);

        if (data.artists.total <= 0) {
          return reject(`Spotify found no artists with query: "${query}".`);
        }

        const items = data.artists.items;

        let item = items.find(item => item.name.toLowerCase() === query);

        if (!item) {
          return reject(`Couldnt find artist by ${query}`);
        }

        return resolve(item.id);
      })
      .catch(reject);
  });
}

function getTracks(artists) {
  artists.map(artist => {
    findArtist(artist)
        .then(getTopTrack)
        .then(getTopTrackInfo)
        .then(injectLoaderIntoPage)
        .then(injectTrackIntoPage)
        .catch(handleError);
  });
}

function getTopTrack(id) {
  const url = `https://api.spotify.com/v1/artists/${id}/top-tracks` +
              '?country=GB' +
              '&limit=1';

  return fetch(url).then(response => response.json());
}

function getTopTrackInfo(data) {
  return new Promise((resolve, reject) => {
    if (data.error) {
      return reject(data.error.message);
    }

    // return nothing if no data sent to template
    if (data.tracks.length <= 0) {
      return reject('No tracks for this artist');
    }

    const tracks = data.tracks;

    let track = tracks.find(track => track.artists[0].name.toLowerCase() === artists[0].toLowerCase());

    if (!track) {
      track = tracks[0];
    }

    if (track.album.images.length > 0) {
      track.image = track.album.images[1].url;
    }

    resolve(track);
  });
}

function processSpotifyArtists(artists) {
  return artists.map(artist => artist.name).join(', ');
}

function injectLoaderIntoPage(data) {
  return new Promise((resolve, reject) => {
    const spotifyTracksElement = document.querySelector('.spotify-tracks');

    // skip creation if already there
    if (spotifyTracksElement) {
      return resolve(data);
    }

    if (!sidebarElement) {
      return reject('No sidebar panel to inject content into');
    }

    const html = `
      <div class="component spotify-tracks">
        <div class="spotify-tracks-content">
          <h5>Tracks from Spotify</h5>

          <ol></ol>
        </div>
      </div>
    `;

    sidebarElement.innerHTML = html + sidebarElement.innerHTML;

    resolve(data);
  });
}

function injectTrackIntoPage(track) {
  console.log(track);
  const spotifyTracksContentElement = document.querySelector('.spotify-tracks-content ol');

  const html = `
    <li>
      <a href="${track.external_urls.spotify}" target="_blank" class="track-details">
        <img class="track-image" src="${track.image}" alt="Album art for '${track.name}'">

        <ul>
          <li>${track.name}</li>
          <li>${processSpotifyArtists(track.artists)}</li>
          <li>${track.album && track.album.name}</li>
        </ul>
      </a>

      <audio class="track-audio" src="${track.preview_url}" controls preload="none"></audio>
    </li>
  `;

  spotifyTracksContentElement.innerHTML += html;
}

debug && console.info(extensionName + 'Starting script');

onlyOneTrackPlayingAtOnce();

findArtistsInPage()
  .then(sanitizeArtists)
  .then(getTracks)
  .catch(handleError);
