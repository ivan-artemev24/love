/**
 * Дата начала отношений (Год, Месяц [0-11], День, Часы, Минуты)
 */
const RELATIONSHIP_START_DATE = new Date(2024, 10, 11, 12, 0, 0);

// SVG-иконка маркера с сердечком
const HEART_PIN_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46">
    <path d="M19 2C9.6 2 2 9.6 2 19c0 11.8 17 25 17 25s17-13.2 17-25c0-9.4-7.6-17-17-17z" 
          fill="#c97a7e" stroke="#ffffff" stroke-width="2.5"/>
    <path d="M19 25.5s-6.5-4.2-6.5-8.3c0-2.1 1.6-3.7 3.6-3.7 1.2 0 2.3.6 2.9 1.6.6-1 1.7-1.6 2.9-1.6 2 0 3.6 1.6 3.6 3.7 0 4.1-6.5 8.3-6.5 8.3z" 
          fill="#ffffff"/>
  </svg>
`);

let map;
let markersCollection;
const markersStore = new Map(); // Хранилище данных меток по их ID

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    window.lucide.createIcons();
  }
  document.getElementById('current-year').textContent = new Date().getFullYear();

  initRelationshipTimer();
  initLightbox();
  initModals();

  if (window.ymaps) {
    ymaps.ready(initMapAndMemories);
  } else {
    console.error('Не удалось загрузить скрипт Яндекс Карт');
  }
});

/* ==========================================================================
   1. ТАЙМЕР ОТНОШЕНИЙ
   ========================================================================== */
function pluralize(number, forms) {
  const n = Math.abs(number) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

function initRelationshipTimer() {
  const elYears = document.getElementById('years');
  const elMonths = document.getElementById('months');
  const elDays = document.getElementById('days');
  const elHours = document.getElementById('hours');
  const elMinutes = document.getElementById('minutes');
  const elSeconds = document.getElementById('seconds');

  function update() {
    const now = new Date();
    let years = now.getFullYear() - RELATIONSHIP_START_DATE.getFullYear();
    let months = now.getMonth() - RELATIONSHIP_START_DATE.getMonth();
    let days = now.getDate() - RELATIONSHIP_START_DATE.getDate();
    let hours = now.getHours() - RELATIONSHIP_START_DATE.getHours();
    let minutes = now.getMinutes() - RELATIONSHIP_START_DATE.getMinutes();
    let seconds = now.getSeconds() - RELATIONSHIP_START_DATE.getSeconds();

    if (seconds < 0) { seconds += 60; minutes--; }
    if (minutes < 0) { minutes += 60; hours--; }
    if (hours < 0) { hours += 24; days--; }
    if (days < 0) {
      const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      days += prevMonth.getDate();
      months--;
    }
    if (months < 0) { months += 12; years--; }

    // Обновляем цифры
    elYears.textContent = years;
    elMonths.textContent = months;
    elDays.textContent = days;
    elHours.textContent = String(hours).padStart(2, '0');
    elMinutes.textContent = String(minutes).padStart(2, '0');
    elSeconds.textContent = String(seconds).padStart(2, '0');

    // Обновляем подписи с правильным склонением
    elYears.nextElementSibling.textContent = pluralize(years, ['год', 'года', 'лет']);
    elMonths.nextElementSibling.textContent = pluralize(months, ['месяц', 'месяца', 'месяцев']);
    elDays.nextElementSibling.textContent = pluralize(days, ['день', 'дня', 'дней']);
    elHours.nextElementSibling.textContent = pluralize(hours, ['час', 'часа', 'часов']);
    elMinutes.nextElementSibling.textContent = pluralize(minutes, ['минута', 'минуты', 'минут']);
    elSeconds.nextElementSibling.textContent = pluralize(seconds, ['секунда', 'секунды', 'секунд']);
  }

  update();
  setInterval(update, 1000);
}

/* ==========================================================================
   2. ЯНДЕКС КАРТА И УПРАВЛЕНИЕ МЕТКАМИ
   ========================================================================== */
function initMapAndMemories() {
  map = new ymaps.Map('map', {
    center: [55.7558, 37.6173],
    zoom: 11,
    controls: ['zoomControl', 'geolocationControl']
  });

  map.behaviors.disable('scrollZoom');

  markersCollection = new ymaps.GeoObjectCollection();
  map.geoObjects.add(markersCollection);

  loadMarkers(true);

  // Клик по карте — открываем модальное окно в режиме создания новой точки
  map.events.add('click', (e) => {
    const coords = e.get('coords');
    map.balloon.close();
    openCreateModal(coords[0], coords[1]);
  });
}

async function loadMarkers(fitBounds = false) {
  try {
    const res = await fetch('/api/markers');
    const data = await res.json();

    const galleryGrid = document.getElementById('gallery-grid');
    galleryGrid.innerHTML = '';
    markersCollection.removeAll();
    markersStore.clear();

    if (data.length > 0) {
      data.forEach(item => {
        markersStore.set(item.id, item);
        addMarkerToMap(item);
        if (item.image_url) {
          addCardToGallery(item);
        }
      });

      if (fitBounds) {
        if (data.length === 1) {
          map.setCenter([data[0].lat, data[0].lng], 14);
        } else {
          map.setBounds(markersCollection.getBounds(), {
            checkZoomRange: true,
            zoomMargin: 45
          });
        }
      }
    }
  } catch (err) {
    console.error('Ошибка загрузки воспоминаний:', err);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function addMarkerToMap(item) {
  const safeTitle = escapeHtml(item.title);
  const safeDate = escapeHtml(item.event_date);
  const safeDesc = escapeHtml(item.description);

  const balloonHtml = `
    <div class="popup-card">
      ${item.image_url ? `
        <div class="popup-img-wrap">
          <img src="${item.image_url}" class="popup-img" alt="${safeTitle}" onclick="openLightboxById(${item.id})">
        </div>
      ` : ''}
      <div class="popup-body">
        <div class="popup-date">${safeDate}</div>
        <div class="popup-title">${safeTitle}</div>
        ${safeDesc ? `<div class="popup-desc">${safeDesc}</div>` : ''}
      </div>
      <div class="popup-actions">
        <button type="button" class="btn-popup" onclick="openEditModal(${item.id})">Изменить</button>
        <button type="button" class="btn-popup btn-popup-delete" onclick="openDeleteModal(${item.id})">Удалить</button>
      </div>
    </div>
  `;

  const placemark = new ymaps.Placemark(
    [item.lat, item.lng],
    {
      balloonContentBody: balloonHtml,
      hintContent: safeTitle
    },
    {
      iconLayout: 'default#image',
      iconImageHref: HEART_PIN_SVG,
      iconImageSize: [38, 46],
      iconImageOffset: [-19, -44],
      hideIconOnBalloonOpen: false,
      balloonOffset: [0, -40],
      balloonPanelMaxMapArea: 0
    }
  );

  markersCollection.add(placemark);
}

/* ==========================================================================
   3. МОДАЛЬНЫЕ ОКНА (СОЗДАНИЕ, РЕДАКТИРОВАНИЕ, УДАЛЕНИЕ)
   ========================================================================== */
function initModals() {
  const modalMarker = document.getElementById('modal-marker');
  const formMarker = document.getElementById('form-marker');
  const errorMarker = document.getElementById('form-marker-error');

  const closeMarkerModal = () => {
    modalMarker.classList.remove('active');
    errorMarker.textContent = '';
  };

  document.getElementById('btn-close-modal').addEventListener('click', closeMarkerModal);
  document.getElementById('btn-cancel-modal').addEventListener('click', closeMarkerModal);

  // Отправка формы создания или редактирования
  formMarker.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMarker.textContent = '';

    const markerId = document.getElementById('field-id').value;
    const isEdit = Boolean(markerId);
    const submitBtn = document.getElementById('btn-submit-marker');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Сохраняем...';

    const formData = new FormData(formMarker);
    const url = isEdit ? `/api/markers/${markerId}` : '/api/markers';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, { method, body: formData });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Ошибка сохранения');
      }

      await loadMarkers(false);
      formMarker.reset();
      closeMarkerModal();
    } catch (err) {
      errorMarker.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Сохранить';
    }
  });

  // Модальное окно удаления
  const modalDelete = document.getElementById('modal-delete');
  const formDelete = document.getElementById('form-delete');
  const errorDelete = document.getElementById('form-delete-error');

  const closeDeleteModal = () => {
    modalDelete.classList.remove('active');
    errorDelete.textContent = '';
    formDelete.reset();
  };

  document.getElementById('btn-close-delete').addEventListener('click', closeDeleteModal);
  document.getElementById('btn-cancel-delete').addEventListener('click', closeDeleteModal);

  formDelete.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDelete.textContent = '';

    const markerId = document.getElementById('delete-marker-id').value;
    const codeword = document.getElementById('delete-codeword').value;
    const confirmBtn = document.getElementById('btn-confirm-delete');

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Удаляем...';

    try {
      const res = await fetch(`/api/markers/${markerId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeword })
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Ошибка при удалении');
      }

      await loadMarkers(false);
      closeDeleteModal();
    } catch (err) {
      errorDelete.textContent = err.message;
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Удалить';
    }
  });
}

function openCreateModal(lat, lng) {
  const form = document.getElementById('form-marker');
  form.reset();

  document.getElementById('modal-marker-title').textContent = 'Новое воспоминание';
  document.getElementById('label-image').textContent = 'Фотография момента';
  document.getElementById('field-id').value = '';
  document.getElementById('field-lat').value = lat;
  document.getElementById('field-lng').value = lng;
  document.getElementById('form-marker-error').textContent = '';

  document.getElementById('modal-marker').classList.add('active');
}

window.openEditModal = function(id) {
  const item = markersStore.get(id);
  if (!item) return;

  map.balloon.close();
  const form = document.getElementById('form-marker');
  form.reset();

  document.getElementById('modal-marker-title').textContent = 'Редактировать воспоминание';
  document.getElementById('label-image').textContent = 'Заменить фотографию (необязательно)';
  document.getElementById('field-id').value = item.id;
  document.getElementById('field-lat').value = item.lat;
  document.getElementById('field-lng').value = item.lng;
  document.getElementById('field-title').value = item.title;
  document.getElementById('field-date').value = item.event_date !== 'Памятный день' ? item.event_date : '';
  document.getElementById('field-desc').value = item.description || '';
  document.getElementById('form-marker-error').textContent = '';

  document.getElementById('modal-marker').classList.add('active');
};

window.openDeleteModal = function(id) {
  map.balloon.close();
  document.getElementById('form-delete').reset();
  document.getElementById('delete-marker-id').value = id;
  document.getElementById('form-delete-error').textContent = '';
  document.getElementById('modal-delete').classList.add('active');
};

window.openLightboxById = function(id) {
  const item = markersStore.get(id);
  if (item && item.image_url) {
    openLightbox(item.image_url, `${item.title} (${item.event_date || ''})`);
  }
};

/* ==========================================================================
   4. ГАЛЕРЕЯ И ЛАЙТБОКС
   ========================================================================== */
function addCardToGallery(item) {
  const galleryGrid = document.getElementById('gallery-grid');
  const card = document.createElement('div');
  card.className = 'gallery-card';
  card.innerHTML = `
    <img src="${item.image_url}" alt="${escapeHtml(item.title)}" loading="lazy">
    <div class="gallery-overlay">
      <span class="gallery-date">${escapeHtml(item.event_date)}</span>
      <h4 class="gallery-title">${escapeHtml(item.title)}</h4>
    </div>
  `;

  card.addEventListener('click', () => {
    openLightbox(item.image_url, `${item.title} (${item.event_date || ''})`);
  });

  galleryGrid.appendChild(card);
}

function initLightbox() {
  const lightbox = document.getElementById('lightbox');
  const closeBtn = document.getElementById('lightbox-close');

  closeBtn.addEventListener('click', () => lightbox.classList.remove('active'));
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) lightbox.classList.remove('active');
  });
}

function openLightbox(src, caption) {
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  const cap = document.getElementById('lightbox-caption');

  img.src = src;
  cap.textContent = caption;
  lightbox.classList.add('active');
}
