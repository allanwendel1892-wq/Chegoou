import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css'; // OBRIGATÓRIO PARA O MAPA FUNCIONAR

// Configuração do seu ícone personalizado "Chegoou"
const motoIcon = new L.Icon({
  iconUrl: '/moto-chegoou.png', // Caminho da sua imagem na pasta public
  iconSize: [40, 40], // Tamanho do ícone (ajuste conforme necessário)
  iconAnchor: [20, 40], // Ponto do ícone que vai apontar para a coordenada
  popupAnchor: [0, -40], // Onde o balão de texto vai abrir
});

interface DeliveryMapProps {
  lat: number;
  lng: number;
  customerName: string;
}

const DeliveryMap: React.FC<DeliveryMapProps> = ({ lat, lng, customerName }) => {
  return (
    <div className="w-full h-48 rounded-xl overflow-hidden shadow-inner border border-gray-200 z-0 relative">
      <MapContainer 
        center={[lat, lng]} 
        zoom={16} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false} // Remove os botões de +/- para ficar mais limpo
      >
        {/* Usando o OpenStreetMap que é gratuito */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <Marker position={[lat, lng]} icon={motoIcon}>
          <Popup>
            <div className="text-center font-bold text-gray-800">
              Destino: {customerName} <br />
              <span className="text-green-500">Chegoou!</span>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
};

export default DeliveryMap;
