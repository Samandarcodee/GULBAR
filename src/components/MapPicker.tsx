import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, MapPin } from 'lucide-react';
import { Dialog } from './Dialog';

export type Point = { lat: number; lng: number };
const CENTER: [number, number] = [41.5503, 60.6315]; // Urganch
const inUrganch = (p: Point) => p.lat >= 41.2 && p.lat <= 41.9 && p.lng >= 60 && p.lng <= 61.3;

/** Tap the map (or drag the pin, or use "my location") to mark where the flowers should go. Loaded only when opened. */
export default function MapPicker({ initial, onClose, onPick }: { initial?: Point | null; onClose: () => void; onPick: (p: Point) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const place = useRef<(lat: number, lng: number, zoom?: boolean) => void>(() => {});
  const [point, setPoint] = useState<Point | null>(initial || null);
  const [note, setNote] = useState('');
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { zoomControl: true }).setView(initial ? [initial.lat, initial.lng] : CENTER, initial ? 17 : 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    const icon = L.divIcon({ className: 'map-pin', html: '<span></span>', iconSize: [34, 34], iconAnchor: [17, 34] });
    let marker: L.Marker | null = null;
    place.current = (lat, lng, zoom = false) => {
      setPoint({ lat, lng }); setNote('');
      if (marker) marker.setLatLng([lat, lng]);
      else { marker = L.marker([lat, lng], { icon, draggable: true }).addTo(m); marker.on('dragend', () => { const p = marker!.getLatLng(); setPoint({ lat: p.lat, lng: p.lng }); setNote(''); }); }
      if (zoom) m.setView([lat, lng], 17);
    };
    if (initial) place.current(initial.lat, initial.lng);
    m.on('click', e => place.current(e.latlng.lat, e.latlng.lng));
    map.current = m;
    const t = setTimeout(() => m.invalidateSize(), 300); // the dialog animates in, so the map measures itself again
    return () => { clearTimeout(t); m.remove(); map.current = null; };
  }, []);

  function locate() {
    if (!navigator.geolocation) { setNote('Bu qurilmada joylashuvni aniqlab bo‘lmaydi. Xaritada o‘zingiz belgilang.'); return; }
    setLocating(true); setNote('');
    navigator.geolocation.getCurrentPosition(
      pos => { setLocating(false); place.current(pos.coords.latitude, pos.coords.longitude, true); },
      () => { setLocating(false); setNote('Joylashuvni aniqlab bo‘lmadi. Ruxsat bering yoki xaritada o‘zingiz belgilang.'); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }
  const outside = point ? !inUrganch(point) : false;
  return <Dialog title="Manzilni xaritada belgilang" onClose={onClose}>
    <p className="field-help map-help">Xaritaga bosing yoki belgini suring. Kuryer aynan shu nuqtaga boradi.</p>
    <div className="map-box" ref={box} role="application" aria-label="Xarita" />
    <div className="map-actions">
      <button type="button" className="secondary" onClick={locate} disabled={locating}><LocateFixed size={17} /> {locating ? 'Aniqlanmoqda…' : 'Mening joylashuvim'}</button>
    </div>
    {(note || outside) && <p className="error-banner" role="alert">{outside ? 'Bu nuqta Urganchdan tashqarida. GulBar hozircha faqat Urganch bo‘ylab yetkazadi.' : note}</p>}
    <button type="button" className="primary full" disabled={!point || outside} onClick={() => point && onPick({ lat: Math.round(point.lat * 1e5) / 1e5, lng: Math.round(point.lng * 1e5) / 1e5 })}><MapPin size={18} /> Shu nuqtani tanlash</button>
  </Dialog>;
}
