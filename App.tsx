
import React, { useState, useEffect, useRef } from 'react';
import { VerbPad } from './components/VerbPad';
import { Inventory } from './components/Inventory';
import { SceneDisplay } from './components/SceneDisplay';
import { 
  generateAdventureStart, 
  processGameAction, 
  generateSceneImage, 
  detectSceneHotspots,
  generateNarratorAudio 
} from './services/geminiService';
import { GameState, Verb, LogEntry, Hotspot } from './types';

const INITIAL_STATE: GameState = {
  isPlaying: false,
  currentSceneId: null,
  inventory: [],
  history: [],
  imageUrl: null,
  hotspots: [],
  isLoading: false,
  loadingMessage: "",
  gameOver: false,
  theme: "",
  sceneCache: {}
};

// ---- Audio Engine ----

function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext
): Promise<AudioBuffer> {
  // Ensure even byte length for Int16
  if (data.byteLength % 2 !== 0) {
    const newData = new Uint8Array(data.byteLength + 1);
    newData.set(data);
    data = newData;
  }

  const dataInt16 = new Int16Array(data.buffer);
  // Gemini TTS returns 24kHz mono
  const sampleRate = 24000;
  const numChannels = 1;
  const frameCount = dataInt16.length;

  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  const channelData = buffer.getChannelData(0);

  for (let i = 0; i < frameCount; i++) {
    // Convert Int16 to Float32 (-1.0 to 1.0)
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const [selectedVerb, setSelectedVerb] = useState<Verb | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [commandLine, setCommandLine] = useState<string>("");
  const [customInput, setCustomInput] = useState<string>("");
  const [isMuted, setIsMuted] = useState<boolean>(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Auto-scroll log
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [gameState.history]);

  // Construct command line
  useEffect(() => {
    let cmd = "";
    if (selectedVerb) cmd += `${selectedVerb}`;
    if (selectedVerb && selectedItem) cmd += ` ${selectedItem}`;
    if (selectedVerb === Verb.Use && selectedItem) {
      cmd += " on ";
    }
    setCommandLine(cmd);
  }, [selectedVerb, selectedItem]);

  // Initialize AudioContext on first user interaction to bypass browser policies
  const initAudio = () => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const playAudio = async (text: string) => {
    if (isMuted) return;
    
    // Try to init audio just in case
    initAudio();
    const ctx = audioContextRef.current;
    if (!ctx) return;

    try {
      const base64Audio = await generateNarratorAudio(text);
      if (!base64Audio) return;

      const audioBytes = decodeBase64(base64Audio);
      const audioBuffer = await decodeAudioData(audioBytes, ctx);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start();
    } catch (e) {
      console.error("Audio playback error:", e);
    }
  };

  // ---- Visual Logic ----

  // Handle visual updates with caching
  const handleVisualUpdate = async (
    sceneId: string, 
    visualDesc: string, 
    triggerUpdate: boolean,
    interactables: string[]
  ): Promise<{ image: string | null; hotspots: Hotspot[] }> => {
    
    // 1. Check Cache first if it's an existing scene and we don't need to force update
    if (!triggerUpdate && gameState.sceneCache[sceneId]) {
      const cached = gameState.sceneCache[sceneId];
      // If specific items were added/removed, we might need to update interactables, 
      // but we can reuse the image.
      // For now, let's trust the cache's hotspots unless interactables list changed drastically.
      return { image: cached.imageUrl, hotspots: cached.hotspots };
    }

    // 2. Generate New Image
    setGameState(prev => ({ ...prev, loadingMessage: "Rendering Scene..." }));
    const image = await generateSceneImage(visualDesc);

    if (!image) return { image: null, hotspots: [] };

    // 3. Detect Hotspots
    let hotspots: Hotspot[] = [];
    if (interactables.length > 0) {
      setGameState(prev => ({ ...prev, loadingMessage: "Analyzing Objects..." }));
      hotspots = await detectSceneHotspots(image, interactables);
    }

    return { image, hotspots };
  };

  const handleStartGame = async (theme: string) => {
    initAudio();
    setGameState(prev => ({ ...prev, isPlaying: true, isLoading: true, loadingMessage: "Initializing World...", theme }));

    const response = await generateAdventureStart(theme);
    
    const { image, hotspots } = await handleVisualUpdate(
      response.scene_id, 
      response.visual_description, 
      true, // Always generate on start
      response.interactables
    );

    setGameState(prev => ({
      ...prev,
      isLoading: false,
      currentSceneId: response.scene_id,
      imageUrl: image,
      hotspots: hotspots,
      history: [{ type: 'narrator', text: response.narrative }],
      inventory: response.inventory_add ? [response.inventory_add] : [],
      sceneCache: {
        [response.scene_id]: {
          id: response.scene_id,
          imageUrl: image || "",
          hotspots: hotspots,
          visualDescription: response.visual_description,
          interactables: response.interactables
        }
      }
    }));

    playAudio(response.narrative);
  };

  const executeCommand = async (fullCommand: string) => {
    if (gameState.isLoading || gameState.gameOver) return;
    initAudio();

    const newHistory: LogEntry[] = [...gameState.history, { type: 'command', text: `> ${fullCommand}` }];
    setGameState(prev => ({ 
      ...prev, 
      history: newHistory,
      isLoading: true,
      loadingMessage: "Thinking...",
    }));
    
    const historyContext = gameState.history.slice(-5).map(h => h.text).join("\n");
    
    const response = await processGameAction(
      fullCommand, 
      historyContext, 
      gameState.inventory,
      gameState.currentSceneId
    );

    // Handle Inventory
    let newInventory = [...gameState.inventory];
    if (response.inventory_add && !newInventory.includes(response.inventory_add)) {
      newInventory.push(response.inventory_add);
    }
    if (response.inventory_remove) {
      newInventory = newInventory.filter(i => i !== response.inventory_remove);
    }

    // Handle Visuals
    let newImage = gameState.imageUrl;
    let newHotspots = gameState.hotspots;

    // If the scene ID changed OR the game engine explicitly requested a visual update
    const needsUpdate = (response.scene_id !== gameState.currentSceneId) || response.trigger_visual_update;

    if (needsUpdate) {
      const visualResult = await handleVisualUpdate(
        response.scene_id,
        response.visual_description,
        response.trigger_visual_update,
        response.interactables
      );
      newImage = visualResult.image || newImage;
      newHotspots = visualResult.hotspots.length > 0 ? visualResult.hotspots : [];
    } else {
      // Visuals stay the same, but we might want to filter hotspots if items were picked up?
      // For simplicity, we keep current hotspots unless a redraw happens.
    }

    setGameState(prev => {
      const nextCache = { ...prev.sceneCache };
      if (newImage) {
        nextCache[response.scene_id] = {
          id: response.scene_id,
          imageUrl: newImage,
          hotspots: newHotspots,
          visualDescription: response.visual_description,
          interactables: response.interactables
        };
      }

      return {
        ...prev,
        isLoading: false,
        history: [...newHistory, { type: 'narrator', text: response.narrative }],
        inventory: newInventory,
        currentSceneId: response.scene_id,
        imageUrl: newImage,
        hotspots: newHotspots,
        gameOver: response.is_game_over || false,
        sceneCache: nextCache
      };
    });

    setSelectedVerb(null);
    setSelectedItem(null);
    setCustomInput("");

    playAudio(response.narrative);
  };

  const handleSceneClick = (x: number, y: number, targetName?: string) => {
    if (gameState.isLoading || gameState.gameOver) return;
    initAudio();

    if (targetName) {
      if (selectedVerb === Verb.Use && selectedItem) {
        executeCommand(`Use ${selectedItem} on ${targetName}`);
        return;
      }
      if (selectedVerb) {
         executeCommand(`${selectedVerb} ${targetName}`);
         return;
      }
      // Default click action
      executeCommand(`Look at ${targetName}`);
    } else {
      // Default action if clicking background
      executeCommand("Look at surroundings");
    }
  };

  const handleCustomCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customInput.trim()) {
      executeCommand(customInput);
    }
  };

  const handleInventoryClick = (item: string) => {
    if (selectedVerb === Verb.Use && selectedItem) {
       executeCommand(`Use ${selectedItem} on ${item}`);
    } else if (selectedVerb === Verb.Give && selectedItem) {
       setSelectedItem(item);
    } else {
      setSelectedItem(item);
    }
  };

  if (!gameState.isPlaying) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4 crt">
        <div className="max-w-2xl w-full border-4 border-gray-700 p-8 bg-gray-900 text-center shadow-[0_0_50px_rgba(0,255,0,0.1)]">
          <h1 className="text-6xl font-bold text-yellow-400 mb-4 tracking-tighter drop-shadow-[4px_4px_0_rgba(165,55,253,1)]">RETRO GEN</h1>
          <h2 className="text-xl text-green-500 mb-8 font-bold uppercase">Infinite Adventure Engine</h2>
          
          <div className="mb-8 text-left bg-black p-4 border border-gray-600 font-mono text-gray-300 text-sm">
            <p>LOAD "ADVENTURE",8,1</p>
            <p>SEARCHING FOR STORIES...</p>
            <p>READY.</p>
            <br/>
            <p className="animate-pulse">_</p>
          </div>

          <form onSubmit={(e) => {
            e.preventDefault();
            const form = e.target as HTMLFormElement;
            const input = form.elements.namedItem('theme') as HTMLInputElement;
            if (input.value) handleStartGame(input.value);
          }}>
            <label className="block text-purple-400 mb-2 text-lg">ENTER STORY THEME:</label>
            <input 
              name="theme"
              type="text" 
              placeholder="e.g., Cyberpunk Detective, Haunted Space Station"
              className="w-full bg-gray-800 border-2 border-gray-600 p-3 text-white font-mono focus:border-green-500 focus:outline-none text-center uppercase text-lg mb-4"
              autoFocus
            />
            <button 
              type="submit"
              className="bg-green-700 hover:bg-green-600 text-white font-bold py-3 px-8 uppercase text-xl border-b-4 border-green-900 active:border-0 active:translate-y-1 transition-all w-full"
            >
              Start Game (Enable Audio)
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Main Layout
  return (
    <div className="h-screen w-screen bg-gray-950 flex flex-col md:flex-row font-mono crt select-none overflow-hidden">
      
      {/* LEFT PANEL: Scene & Log */}
      <div className="flex-1 flex flex-col border-r-4 border-gray-700 h-full">
        
        {/* Top: Scene View (Flexible Height) */}
        <div className="flex-[3] bg-black relative border-b-4 border-gray-700 overflow-hidden min-h-0">
          <SceneDisplay 
            imageUrl={gameState.imageUrl} 
            isLoading={gameState.isLoading} 
            loadingMessage={gameState.loadingMessage}
            hotspots={gameState.hotspots}
            onSceneClick={handleSceneClick}
          />
        </div>

        {/* Bottom: Text Log (Grows to fill remaining space) */}
        <div className="flex-[2] bg-black relative flex flex-col min-h-0">
           <div className="bg-gray-800 px-2 py-1 text-xs text-gray-400 uppercase flex justify-between items-center border-b border-gray-700">
              <span>Adventure Log</span>
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className={`px-2 py-0.5 text-[10px] border ${isMuted ? 'border-red-500 text-red-500' : 'border-green-500 text-green-500'}`}
              >
                {isMuted ? 'AUDIO OFF' : 'AUDIO ON'}
              </button>
           </div>
           <div 
             ref={scrollRef}
             className="flex-1 p-6 overflow-y-auto space-y-4 font-medium text-xl leading-relaxed"
           >
              {gameState.history.map((log, idx) => (
                <div key={idx} className={`${log.type === 'command' ? 'text-gray-500 mt-4 text-sm' : 'text-green-100 drop-shadow-md'}`}>
                  {log.text}
                </div>
              ))}
              {gameState.gameOver && (
                <div className="text-red-500 font-bold mt-4 text-center uppercase text-2xl animate-bounce">
                  *** GAME OVER ***
                </div>
              )}
           </div>
        </div>
      </div>

      {/* RIGHT PANEL: Sidebar Controls */}
      <div className="w-full md:w-80 bg-gray-800 flex flex-col border-l-4 border-gray-600 shrink-0 h-64 md:h-full shadow-xl z-10">
        
        {/* Command Line Display */}
        <div className="bg-black text-green-400 p-3 font-bold text-center border-b border-gray-700 min-h-[3rem] flex items-center justify-center shadow-inner">
          {commandLine}<span className="animate-pulse ml-1">_</span>
        </div>

        {/* Controls Grid - Mobile: Row / Desktop: Column */}
        <div className="flex flex-row md:flex-col flex-1 min-h-0">
          
          {/* Verbs */}
          <div className="w-1/2 md:w-full md:flex-none md:h-auto border-r md:border-r-0 md:border-b border-gray-700 overflow-auto">
             <VerbPad 
                selectedVerb={selectedVerb} 
                onVerbSelect={setSelectedVerb} 
              />
          </div>

          {/* Inventory */}
          <div className="w-1/2 md:w-full flex-1 md:flex-grow overflow-hidden">
             <Inventory 
                 items={gameState.inventory} 
                 onItemSelect={handleInventoryClick}
                 selectedItem={selectedItem}
               />
          </div>

        </div>

        {/* Manual Input Footer */}
        <div className="hidden md:block p-3 bg-gray-900 border-t border-gray-700">
           <form onSubmit={handleCustomCommandSubmit} className="flex flex-col gap-2">
             <input 
               type="text" 
               value={customInput}
               onChange={(e) => setCustomInput(e.target.value)}
               placeholder="Manual Override..."
               className="bg-black text-green-500 p-2 text-xs border border-gray-700 focus:border-green-500 outline-none font-mono"
             />
           </form>
           <div className="text-[10px] text-gray-600 text-center mt-2">POWERED BY GEMINI 2.5</div>
        </div>

      </div>
    </div>
  );
};

export default App;
