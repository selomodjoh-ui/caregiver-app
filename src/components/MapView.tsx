import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DEFAULT_CENTRE, type Point } from '../lib/geo';

export interface Pin extends Point {
  id: string;
  /** Read aloud by screen readers and shown on hover. */
  label: string;
  /** Short text inside the pin, such as the number of open shifts. */
  badge?: string;
  /** 'home' is an exact pin. 'area' is a soft circle about a mile wide. */
  kind: 'home' | 'area';
  quiet?: boolean;
}

interface Props {
  pins?: Pin[];
  /** The person looking at the map. */
  me?: Point | null;
  meKind?: 'dot' | 'home';
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Picker mode: tapping the map calls this. */
  onPick?: (p: Point) => void;
  picked?: Point | null;
  /** Draws the picked spot as a rough area instead of a pin. */
  pickedAsArea?: boolean;
  /** Changing this number re-centres the map on what it shows. */
  refit?: number;
  label: string;
}

const AREA_METRES = 1100;

function pinIcon(pin: Pin, selected: boolean) {
  return L.divIcon({
    className: '',
    html: `<span class="map-pin${selected ? ' on' : ''}"><b>${pin.badge ?? ''}</b></span>`,
    iconSize: [38, 46],
    iconAnchor: [19, 44],
  });
}

export default function MapView({
  pins = [],
  me,
  meKind = 'dot',
  selectedId,
  onSelect,
  onPick,
  picked,
  pickedAsArea,
  refit = 0,
  label,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef('');
  const [tick, setTick] = useState(0);
  const handlers = useRef({ onSelect, onPick });
  handlers.current = { onSelect, onPick };

  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(
      [DEFAULT_CENTRE.lat, DEFAULT_CENTRE.lng],
      9,
    );
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    m.on('click', (e) => handlers.current.onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    // The map may be created while its tab is still being laid out.
    const t = setTimeout(() => {
      m.invalidateSize();
      // Fit again now that the map knows its real size.
      fitted.current = '';
      setTick((n) => n + 1);
    }, 60);
    return () => {
      clearTimeout(t);
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const seen: L.LatLngExpression[] = [];

    for (const pin of pins) {
      const on = pin.id === selectedId;
      if (pin.kind === 'area') {
        const c = L.circle([pin.lat, pin.lng], {
          radius: AREA_METRES,
          color: '#1d3a6e',
          weight: on ? 3 : 1.5,
          dashArray: pin.quiet ? '5 5' : undefined,
          fillColor: '#f2b25c',
          fillOpacity: on ? 0.65 : pin.quiet ? 0.2 : 0.45,
        });
        c.bindTooltip(pin.label);
        c.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          handlers.current.onSelect?.(pin.id);
        });
        c.addTo(g);
        // A badge in the middle keeps the area easy to tap when the map is zoomed out.
        const dot = L.marker([pin.lat, pin.lng], {
          icon: L.divIcon({
            className: '',
            html: `<span class="map-count${on ? ' on' : ''}${pin.quiet ? ' quiet' : ''}">${pin.badge ?? ''}</span>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          }),
          title: pin.label,
          alt: pin.label,
          keyboard: true,
        });
        dot.on('click', () => handlers.current.onSelect?.(pin.id));
        dot.on('keypress', (e) => {
          if (e.originalEvent.key === 'Enter') handlers.current.onSelect?.(pin.id);
        });
        dot.addTo(g);
      } else {
        const mk = L.marker([pin.lat, pin.lng], {
          icon: pinIcon(pin, on),
          title: pin.label,
          alt: pin.label,
          keyboard: true,
          zIndexOffset: on ? 500 : 0,
        });
        mk.on('click', () => handlers.current.onSelect?.(pin.id));
        mk.on('keypress', (e) => {
          if (e.originalEvent.key === 'Enter') handlers.current.onSelect?.(pin.id);
        });
        mk.addTo(g);
      }
      seen.push([pin.lat, pin.lng]);
    }

    if (me) {
      if (meKind === 'home') {
        L.marker([me.lat, me.lng], {
          icon: L.divIcon({ className: '', html: '<span class="map-pin mine"></span>', iconSize: [38, 46], iconAnchor: [19, 44] }),
          title: 'Your home',
          alt: 'Your home',
          interactive: false,
        }).addTo(g);
      } else {
        L.circleMarker([me.lat, me.lng], {
          radius: 8,
          color: '#ffffff',
          weight: 3,
          fillColor: '#2f6fb5',
          fillOpacity: 1,
          interactive: false,
        }).addTo(g);
      }
      seen.push([me.lat, me.lng]);
    }

    if (picked) {
      if (pickedAsArea) {
        L.circle([picked.lat, picked.lng], {
          radius: AREA_METRES,
          color: '#1d3a6e',
          weight: 2,
          fillColor: '#f2b25c',
          fillOpacity: 0.45,
          interactive: false,
        }).addTo(g);
      } else {
        L.marker([picked.lat, picked.lng], {
          icon: L.divIcon({ className: '', html: '<span class="map-pin on"></span>', iconSize: [38, 46], iconAnchor: [19, 44] }),
          alt: 'The spot you chose',
          interactive: false,
        }).addTo(g);
      }
      seen.push([picked.lat, picked.lng]);
    }

    // Move the view only when what is on the map changes, never on a tap that selects a pin.
    const key = `${refit}|${pins.map((p) => p.id).join(',')}|${me ? `${me.lat},${me.lng}` : ''}|${
      onPick && picked ? `${picked.lat},${picked.lng}` : ''
    }`;
    if (key !== fitted.current && seen.length > 0) {
      fitted.current = key;
      if (onPick && picked) m.setView([picked.lat, picked.lng], Math.max(m.getZoom(), pickedAsArea ? 12 : 15));
      else if (seen.length === 1) m.setView(seen[0], 12);
      else {
        // Leave room for the area circles, which are about a mile across.
        const room = pins.some((p) => p.kind === 'area') ? 0.015 : 0;
        const b = L.latLngBounds(seen);
        m.fitBounds(
          [
            [b.getSouth() - room, b.getWest() - room * 1.5],
            [b.getNorth() + room, b.getEast() + room * 1.5],
          ],
          { padding: [36, 36], maxZoom: 13, animate: false },
        );
      }
    }
  }, [pins, me, meKind, selectedId, picked, pickedAsArea, refit, onPick, tick]);

  return <div ref={box} className={`map${onPick ? ' picking' : ''}`} role="application" aria-label={label} />;
}
