import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Map as MapIcon, Paintbrush, Box, RefreshCw, Save, Trash2, ChevronRight, ChevronLeft, Sliders, Zap } from 'lucide-react';
import { BIOME_CONFIGS, BiomeType, Tile } from '../../server/mapgen';
import TerrainTile from './TerrainTile';
import EnvironmentObject from './EnvironmentObject';

const TILE_W = 64;
const TILE_H = 32;

function isoProject(x: number, y: number) {
  return {
    left: (x - y) * (TILE_W / 2),
    top: (x + y) * (TILE_H / 2),
  };
}

interface MapEditorProps {
  initialMap: { width: number; height: number; tiles: Tile[] };
  onSave: (map: { width: number; height: number; tiles: Tile[] }) => void;
  onClose: () => void;
}

export default function MapEditor({ initialMap, onSave, onClose }: MapEditorProps) {
  const [map, setMap] = useState(initialMap);
  const [selectedBiome, setSelectedBiome] = useState<BiomeType>('wasteland');
  const [brushType, setBrushType] = useState<'terrain' | 'object'>('terrain');
  const [selectedTerrain, setSelectedTerrain] = useState<Tile['kind']>('wasteland');
  const [selectedObject, setSelectedObject] = useState<Tile['object_kind']>('none');
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Generation parameters
  const [genParams, setGenParams] = useState({
    objectDensity: 0.1,
    rubbleFrequency: 0.15,
    wallDensity: 0.5,
    factionPresence: '',
  });

  const handleRegenerate = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/world/generate-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          width: map.width,
          height: map.height,
          biome: selectedBiome,
          object_density: genParams.objectDensity,
          rubble_frequency: genParams.rubbleFrequency,
          wall_density: genParams.wallDensity,
          faction_presence: genParams.factionPresence ? [genParams.factionPresence] : [],
        }),
      });
      if (response.ok) {
        const newMap = await response.json();
        setMap(newMap);
      }
    } catch (error) {
      console.error('Failed to regenerate map:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const terrainTypes: Tile['kind'][] = [
    'floor', 'rubble', 'wall', 'rock', 'dirt', 'grass', 'pavement', 'cracked_pavement', 'sand', 'wasteland', 'water', 'toxic_sludge', 'metal_floor'
  ];

  const objectTypes: NonNullable<Tile['object_kind']>[] = [
    'none', 'barrel', 'crate', 'debris', 'ruined_wall', 'cactus', 'terminal', 'pipe', 'radioactive_barrel', 'computer_console', 'power_generator', 'ruined_car', 'skeleton', 'scrap_heap', 'vending_machine'
  ];

  const handleTileAction = (x: number, y: number) => {
    const newTiles = [...map.tiles];
    const index = y * map.width + x;
    const tile = { ...newTiles[index] };

    if (brushType === 'terrain') {
      tile.kind = selectedTerrain;
      if (selectedTerrain === 'wall' || selectedTerrain === 'rock') {
        tile.ap_cost = -1;
      } else if (selectedTerrain === 'water' || selectedTerrain === 'toxic_sludge') {
        tile.ap_cost = 3;
      } else if (selectedTerrain === 'rubble') {
        tile.ap_cost = 2;
      } else {
        tile.ap_cost = 1;
      }
    } else {
      tile.object_kind = selectedObject;
      if (selectedObject !== 'none') {
        tile.ap_cost = 2;
      } else if (tile.kind !== 'wall' && tile.kind !== 'rock') {
        tile.ap_cost = 1;
      }
    }

    newTiles[index] = tile;
    setMap({ ...map, tiles: newTiles });
  };

  const gridOffset = isoProject(0, map.height - 1);
  const gridRight = isoProject(map.width - 1, 0);
  const totalWidth = gridRight.left - gridOffset.left + TILE_W;
  const totalHeight = isoProject(map.width - 1, map.height - 1).top + TILE_H;

  return (
    <div className="crt flex flex-col h-full bg-black text-green-500 font-mono border-2 border-green-900 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b-2 border-green-900 bg-green-950/20">
        <div className="flex items-center gap-3">
          <MapIcon className="w-6 h-6" />
          <h1 className="text-xl font-black tracking-tighter uppercase">Wasteland Engine: Map Editor</h1>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => onSave(map)}
            className="flex items-center gap-2 px-4 py-2 bg-green-900 hover:bg-green-700 text-black font-bold uppercase text-xs transition-all"
          >
            <Save className="w-4 h-4" /> Save Map
          </button>
          <button 
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 border border-green-900 hover:bg-red-950 hover:border-red-500 hover:text-red-500 font-bold uppercase text-xs transition-all"
          >
            Exit
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Controls */}
        <div className="w-72 border-r-2 border-green-900 p-4 flex flex-col gap-6 overflow-y-auto bg-black/40">
          <section>
            <h2 className="text-xs font-bold text-green-700 uppercase mb-3 flex items-center gap-2">
              <RefreshCw className="w-3 h-3" /> Biome Settings
            </h2>
            <select 
              value={selectedBiome}
              onChange={(e) => setSelectedBiome(e.target.value as BiomeType)}
              className="w-full bg-black border border-green-900 p-2 text-xs text-green-500 outline-none focus:border-green-500 mb-4"
            >
              {Object.keys(BIOME_CONFIGS).map(b => (
                <option key={b} value={b}>{b.toUpperCase()}</option>
              ))}
            </select>

            <div className="space-y-4 border-t border-green-900/30 pt-4">
              <h3 className="text-[10px] font-bold text-green-800 uppercase flex items-center gap-2">
                <Sliders className="w-3 h-3" /> Generation Tuning
              </h3>
              
              <div className="space-y-1">
                <div className="flex justify-between text-[8px] uppercase">
                  <span>Object Density</span>
                  <span>{Math.round(genParams.objectDensity * 100)}%</span>
                </div>
                <input 
                  type="range" min="0" max="0.5" step="0.01"
                  value={genParams.objectDensity}
                  onChange={(e) => setGenParams({...genParams, objectDensity: parseFloat(e.target.value)})}
                  className="w-full accent-green-500 bg-green-900/20 h-1 rounded-full appearance-none cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[8px] uppercase">
                  <span>Rubble Freq</span>
                  <span>{Math.round(genParams.rubbleFrequency * 100)}%</span>
                </div>
                <input 
                  type="range" min="0" max="0.6" step="0.01"
                  value={genParams.rubbleFrequency}
                  onChange={(e) => setGenParams({...genParams, rubbleFrequency: parseFloat(e.target.value)})}
                  className="w-full accent-green-500 bg-green-900/20 h-1 rounded-full appearance-none cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[8px] uppercase">
                  <span>Wall Density</span>
                  <span>{Math.round(genParams.wallDensity * 100)}%</span>
                </div>
                <input 
                  type="range" min="0.1" max="0.9" step="0.01"
                  value={genParams.wallDensity}
                  onChange={(e) => setGenParams({...genParams, wallDensity: parseFloat(e.target.value)})}
                  className="w-full accent-green-500 bg-green-900/20 h-1 rounded-full appearance-none cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="text-[8px] uppercase mb-1">Faction Presence</div>
                <input 
                  type="text"
                  value={genParams.factionPresence}
                  onChange={(e) => setGenParams({...genParams, factionPresence: e.target.value})}
                  placeholder="e.g. Raiders, Vault-Tec"
                  className="w-full bg-black border border-green-900 p-2 text-[10px] text-green-500 outline-none focus:border-green-500"
                />
              </div>

              <button 
                onClick={handleRegenerate}
                disabled={isGenerating}
                className="w-full flex items-center justify-center gap-2 py-2 bg-green-500 hover:bg-green-400 text-black font-bold uppercase text-[10px] transition-all disabled:opacity-50"
              >
                <Zap className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
                {isGenerating ? 'Generating...' : 'Regenerate Map'}
              </button>
            </div>
          </section>

          <section>
            <h2 className="text-xs font-bold text-green-700 uppercase mb-3 flex items-center gap-2">
              <Paintbrush className="w-3 h-3" /> Brush Type
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => setBrushType('terrain')}
                className={`p-2 text-[10px] font-bold border transition-all ${brushType === 'terrain' ? 'bg-green-500 text-black border-green-500' : 'border-green-900 hover:border-green-500'}`}
              >
                TERRAIN
              </button>
              <button 
                onClick={() => setBrushType('object')}
                className={`p-2 text-[10px] font-bold border transition-all ${brushType === 'object' ? 'bg-green-500 text-black border-green-500' : 'border-green-900 hover:border-green-500'}`}
              >
                OBJECT
              </button>
            </div>
          </section>

          {brushType === 'terrain' ? (
            <section>
              <h2 className="text-xs font-bold text-green-700 uppercase mb-3">Terrain Palette</h2>
              <div className="grid grid-cols-3 gap-2">
                {terrainTypes.map(t => (
                  <button 
                    key={t}
                    onClick={() => setSelectedTerrain(t)}
                    className={`group relative aspect-square border-2 transition-all flex items-center justify-center ${selectedTerrain === t ? 'border-green-500 bg-green-900/40' : 'border-green-900 hover:border-green-700'}`}
                    title={t}
                  >
                    <div className="w-8 h-8 relative">
                      <TerrainTile kind={t} className="w-full h-full opacity-60 group-hover:opacity-100" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-[8px] text-center py-0.5 opacity-0 group-hover:opacity-100 uppercase truncate px-1">
                      {t.replace('_', ' ')}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section>
              <h2 className="text-xs font-bold text-green-700 uppercase mb-3">Object Library</h2>
              <div className="grid grid-cols-3 gap-2">
                {objectTypes.map(o => (
                  <button 
                    key={o}
                    onClick={() => setSelectedObject(o)}
                    className={`group relative aspect-square border-2 transition-all flex items-center justify-center ${selectedObject === o ? 'border-green-500 bg-green-900/40' : 'border-green-900 hover:border-green-700'}`}
                    title={o}
                  >
                    {o === 'none' ? (
                      <Trash2 className="w-6 h-6 text-red-900" />
                    ) : (
                      <div className="w-8 h-8 relative">
                        <EnvironmentObject kind={o} className="w-full h-full opacity-60 group-hover:opacity-100" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-[8px] text-center py-0.5 opacity-0 group-hover:opacity-100 uppercase truncate px-1">
                      {o.replace('_', ' ')}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="mt-auto pt-4 border-t border-green-900">
            <div className="text-[10px] text-green-800 uppercase mb-2">Editor Stats</div>
            <div className="flex justify-between text-[10px]">
              <span>Dimensions:</span>
              <span>{map.width}x{map.height}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span>Total Tiles:</span>
              <span>{map.tiles.length}</span>
            </div>
          </div>
        </div>

        {/* Canvas Area */}
        <div 
          className="flex-1 overflow-auto bg-[radial-gradient(circle_at_center,rgba(20,40,20,0.2)_0%,transparent_100%)] p-20 cursor-crosshair"
          onMouseDown={() => setIsMouseDown(true)}
          onMouseUp={() => setIsMouseDown(false)}
          onMouseLeave={() => setIsMouseDown(false)}
        >
          <div className="relative mx-auto" style={{ width: totalWidth, height: totalHeight }}>
            {/* Grid Lines */}
            <div className="absolute inset-0 pointer-events-none opacity-5" style={{ 
              backgroundImage: `linear-gradient(rgba(34,197,94,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.2) 1px, transparent 1px)`,
              backgroundSize: `${TILE_W}px ${TILE_H}px`,
              transform: 'rotateX(60deg) rotateZ(45deg) scale(2)',
              transformOrigin: 'center center'
            }} />

            {map.tiles.map((tile) => {
              const pos = isoProject(tile.x, tile.y);
              const adjustedLeft = pos.left - gridOffset.left;

              return (
                <div
                  key={`${tile.x}-${tile.y}`}
                  className="absolute group"
                  style={{
                    left: adjustedLeft,
                    top: pos.top,
                    width: TILE_W,
                    height: TILE_H,
                  }}
                  onMouseEnter={() => isMouseDown && handleTileAction(tile.x, tile.y)}
                  onMouseDown={() => handleTileAction(tile.x, tile.y)}
                >
                  <div
                    className={`absolute inset-0 border border-green-900/20 transition-all duration-200 group-hover:border-green-500/50`}
                    style={{
                      clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                    }}
                  >
                    <TerrainTile kind={tile.kind} className="opacity-40 group-hover:opacity-60" />
                  </div>

                  {tile.object_kind && tile.object_kind !== 'none' && (
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-1/2 w-10 h-10 z-10 pointer-events-none">
                      <EnvironmentObject kind={tile.object_kind} className="w-full h-full" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
