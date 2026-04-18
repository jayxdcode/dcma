import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { parseLRCToArray, addTimestamps } from '../lib/lyrics';
import { useModals } from '../components/ModalProvider'; 

const LRC_ENDPOINT = window.location.origin.includes("vercel.app") ? `/api/translate` : `https://frontend-dcma.vercel.app/api/translate`;

const LyricsContext = createContext({
    lyrics: [],
    candidates: [],
    loadLyrics: async () => {}
});

export const LyricsProvider = ({ children }) => {
    const [lyrics, setLyrics] = useState([]);
    const [candidates, setCandidates] = useState([]);
    const { showAlert } = useModals();
    
    // Access this from the console or other scripts via window.lastCandidates
    const lastCandidatesRef = useRef([]);

    const loadLyrics = useCallback(async (title, artist, album, duration, onTransReady, manual = { flag: false, query: "" }, signal = null) => {
        // Internal helper to update both the Context state and the callback
        const updateLyrics = (data) => {
            setLyrics(data);
            if (onTransReady) onTransReady(data);
        };

        try {
            // --- UI Feedback ---
            if (!manual.flag) {
                updateLyrics([{
                    time: 0,
                    text: 'Searching for lyrics...',
                    roman: `Attempt 1 out of 2`,
                    trans: `${title} - ${artist}`
                }]);
            }

            // --- 1. Manual Config Check (Simulated) ---
            const trackKey = `${title}|${artist}`;
            // If you have a local config file for manual offsets, check it here

            // --- 2. Search Logic ---
            const primaryQuery = manual.flag ? manual.query : `${title} ${artist} ${album || ''}`.trim();
            let response = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(primaryQuery)}`, { signal });
            let searchData = await response.json();

            // Fallback (Attempt 2)
            if (!manual.flag && (!Array.isArray(searchData) || !searchData.some(c => c.syncedLyrics))) {
                updateLyrics([{ time: 0, text: 'Searching...', roman: 'Attempt 2: Retrying without album', trans: '' }]);
                const fallbackRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(`${title} ${artist}`)}`, { signal });
                searchData = await fallbackRes.json();
            }

            // --- 3. Candidate Management ---
            const sorted = (Array.isArray(searchData) ? searchData : []).sort((a, b) => {
                if (a.syncedLyrics && !b.syncedLyrics) return -1;
                if (!a.syncedLyrics && b.syncedLyrics) return 1;
                return 0;
            });

            // Set global variables
            setCandidates(sorted);
            lastCandidatesRef.current = sorted;
            window.lastCandidates = sorted; // <--- Global Access

            // --- 4. Selection ---
            let candidate = null;
            let minDelta = Infinity;
            sorted.filter(c => c.syncedLyrics).forEach(c => {
                const delta = Math.abs(Number(c.duration) * 1000 - duration);
                if (delta < minDelta && delta < 8000) {
                    candidate = c;
                    minDelta = delta;
                }
            });
            if (!candidate && sorted.length > 0) candidate = sorted[0];

            if (!candidate) {
                updateLyrics([{ time: 0, text: '× No lyrics found.', roman: '', trans: '' }]);
                return;
            }

            // --- 5. Parsing & Fetching Translations ---
            const rawLrc = candidate.syncedLyrics || addTimestamps(candidate.plainLyrics);
            updateLyrics(parseLRCToArray(rawLrc)); // Instant render

            // Call your backend for translations (Update URL to your actual backend)
            try {
                const transRes = await fetch(LRC_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${backendKey}` },
                    body: JSON.stringify({ lrc: rawLrc, title, artist }),
                    signal
                });
                const { rom, transl } = await transRes.json();
                updateLyrics(parseLRCToArray(rawLrc, rom, transl));
            } catch (err) {
                console.warn("Translation failed, staying with original.");
            }

        } catch (e) {
            if (e.name === 'AbortError') return;
            showAlert(`Lyrics Error: ${e.message}`, "fail");
            updateLyrics([{ time: 0, text: '× Error loading lyrics.', roman: '', trans: '' }]);
        }
    }, [showAlert]);

    return (
        <LyricsContext.Provider value={{ lyrics, candidates, loadLyrics }}>
            {children}
        </LyricsContext.Provider>
    );
};

export const useLyrics = () => useContext(LyricsContext) || {
    lyrics: [],
    candidates: [],
    loadLyrics: async () => {}
};
