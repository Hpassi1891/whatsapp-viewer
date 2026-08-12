let parsedMessages = [];
let currentlyRenderedIndex = 0;
const BATCH_SIZE = 300;
let user1 = null;
let mediaMap = {}; 
let lastParsedDate = null;

// Search State Variables
let searchResults = [];
let currentSearchIndex = -1;
let activeQuery = '';

const msgRegex = /^\[?(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}[, ]+[\d:\s]+(?:AM|PM|am|pm)?)\]?\s*(?:-)?\s*(.*?):\s*(.*)$/;
const sysRegex = /^\[?(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}[, ]+[\d:\s]+(?:AM|PM|am|pm)?)\]?\s*(?:-)?\s*(.*)$/;

// DOM Elements
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const clearBtn = document.getElementById('clearBtn');
const searchResultText = document.getElementById('searchResultText');

document.getElementById('zipFile').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const progressContainer = document.getElementById('progress-bar-container');
    const progressBar = document.getElementById('progress-bar');
    const statusText = document.getElementById('status-text');
    const container = document.getElementById('chat-container');

    container.innerHTML = '';
    parsedMessages = [];
    currentlyRenderedIndex = 0;
    user1 = null;
    mediaMap = {};
    lastParsedDate = null;
    
    // Reset search
    searchInput.disabled = true;
    searchBtn.disabled = true;
    clearSearchUI();

    progressContainer.style.display = 'block';
    statusText.innerText = 'Unzipping archive...';
    progressBar.style.width = '10%';

    try {
        const zip = await JSZip.loadAsync(file);
        let chatFile = null;

        const zipKeys = Object.keys(zip.files);
        let processedFiles = 0;

        for (let filename of zipKeys) {
            const entry = zip.files[filename];
            if (entry.dir) continue;
            const cleanFileName = filename.split('/').pop();

            if (cleanFileName.endsWith('.txt') && !cleanFileName.startsWith('.')) {
                chatFile = entry;
            } else {
                const blob = await entry.async('blob');
                mediaMap[cleanFileName] = URL.createObjectURL(blob);
            }

            processedFiles++;
            const pct = Math.round((processedFiles / zipKeys.length) * 50);
            progressBar.style.width = (10 + pct) + '%';
            statusText.innerText = `Extracting files (${processedFiles}/${zipKeys.length})...`;
        }

        if (!chatFile) {
            alert('No .txt chat file found inside the uploaded zip archive.');
            return;
        }

        statusText.innerText = 'Parsing chat messages...';
        progressBar.style.width = '70%';

        const textContent = await chatFile.async('string');
        const lines = textContent.split('\n');
        lines.forEach(line => processLine(line.trim()));

        progressBar.style.width = '100%';
        statusText.innerText = `Loaded ${parsedMessages.length.toLocaleString()} items.`;
        
        searchInput.disabled = false;
        searchBtn.disabled = false;
        
        setTimeout(() => {
            progressContainer.style.display = 'none';
        }, 1000);

        renderNextBatch();

    } catch (err) {
        alert('Failed to process zip file. Make sure it is a valid ZIP archive.');
    }
});

// --- NEW: FOLDER UPLOAD LOGIC ---
document.getElementById('folderInput').addEventListener('change', async function(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const progressContainer = document.getElementById('progress-bar-container');
    const progressBar = document.getElementById('progress-bar');
    const statusText = document.getElementById('status-text');
    const container = document.getElementById('chat-container');

    // Reset UI and Data
    container.innerHTML = '';
    parsedMessages = [];
    currentlyRenderedIndex = 0;
    user1 = null;
    mediaMap = {};
    lastParsedDate = null;
    searchInput.disabled = true;
    searchBtn.disabled = true;
    clearSearchUI();

    progressContainer.style.display = 'block';
    statusText.innerText = 'Scanning folder contents...';
    progressBar.style.width = '30%';

    let chatFile = null;
    let processedFiles = 0;

    // Map the files provided by the folder upload
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const cleanFileName = file.name;

        if (cleanFileName.endsWith('.txt') && !cleanFileName.startsWith('.')) {
            chatFile = file;
        } else {
            // Create object URL directly from the local file
            mediaMap[cleanFileName] = URL.createObjectURL(file);
        }

        processedFiles++;
        const pct = Math.round((processedFiles / files.length) * 40) + 30; // Scale from 30% to 70%
        progressBar.style.width = pct + '%';
        statusText.innerText = `Mapping files (${processedFiles}/${files.length})...`;
    }

    if (!chatFile) {
        alert('No .txt chat file found inside the selected folder.');
        statusText.innerText = 'Error: Chat text file missing.';
        progressContainer.style.display = 'none';
        return;
    }

    statusText.innerText = 'Parsing chat messages...';
    progressBar.style.width = '85%';

    try {
        // Read the text file directly
        const textContent = await chatFile.text();
        const lines = textContent.split('\n');
        
        lines.forEach(line => processLine(line.trim()));

        progressBar.style.width = '100%';
        statusText.innerText = `Loaded ${parsedMessages.length.toLocaleString()} items.`;
        
        searchInput.disabled = false;
        searchBtn.disabled = false;
        
        setTimeout(() => {
            progressContainer.style.display = 'none';
        }, 1000);

        renderNextBatch();
    } catch (err) {
        console.error(err);
        alert('Failed to read the chat text file.');
        statusText.innerText = 'Error reading file.';
    }
});

function processLine(line) {
    if (!line) return;
    const match = line.match(msgRegex);
    if (match) {
        const timestamp = match[1];
        const sender = match[2];
        const text = match[3];

        const dateMatch = timestamp.match(/^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/);
        if (dateMatch) {
            const currentDate = dateMatch[1];
            if (currentDate !== lastParsedDate) {
                lastParsedDate = currentDate;
                parsedMessages.push({ type: 'date', dateText: currentDate });
            }
        }
        if (!user1) user1 = sender;
        parsedMessages.push({ type: 'msg', timestamp: timestamp, sender: sender, text: text, isRight: sender !== user1 });
    } else {
        const sysMatch = line.match(sysRegex);
        if (sysMatch && parsedMessages.length === 0) {
            parsedMessages.push({ type: 'sys', text: sysMatch[2] });
        } else if (parsedMessages.length > 0) {
            parsedMessages[parsedMessages.length - 1].text += '\n' + line;
        }
    }
}

function renderNextBatch() {
    const container = document.getElementById('chat-container');
    const endIndex = Math.min(currentlyRenderedIndex + BATCH_SIZE, parsedMessages.length);
    const fragment = document.createDocumentFragment();

    let highlightRegex = null;
    if (activeQuery) {
        // Create regex to highlight text regardless of upper/lower case
        highlightRegex = new RegExp(`(${escapeRegExp(activeQuery)})`, 'gi');
    }

    for (let i = currentlyRenderedIndex; i < endIndex; i++) {
        const item = parsedMessages[i];

        if (item.type === 'sys') {
            const div = document.createElement('div');
            div.className = 'system-msg';
            div.innerText = item.text;
            fragment.appendChild(div);
        } else if (item.type === 'date') {
            const div = document.createElement('div');
            div.className = 'date-badge';
            div.innerText = item.dateText;
            fragment.appendChild(div);
        } else {
            const div = document.createElement('div');
            div.className = `message ${item.isRight ? 'right' : 'left'}`;
            div.id = `msg-${i}`; // Attach global index ID for jumping

            const senderSpan = `<span class="sender-name">${escapeHtml(item.sender)}</span>`;
            const timeSpan = `<span class="time">${escapeHtml(item.timestamp)}</span>`;
            const mediaContent = checkAndRenderMedia(item.text, highlightRegex);

            div.innerHTML = senderSpan + mediaContent + timeSpan;
            fragment.appendChild(div);
        }
    }

    container.appendChild(fragment);
    currentlyRenderedIndex = endIndex;
}

function checkAndRenderMedia(text, highlightRegex) {
    let renderedMedia = '';
    let foundMediaKey = null;

    for (let key of Object.keys(mediaMap)) {
        if (text.includes(key)) {
            foundMediaKey = key;
            break;
        }
    }

    let cleanText = text;
    if (foundMediaKey) {
        const mediaUrl = mediaMap[foundMediaKey];
        const ext = foundMediaKey.split('.').pop().toLowerCase();

        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
            renderedMedia += `<img src="${mediaUrl}" class="media-preview" alt="attachment" />`;
        } else if (['mp4', 'webm', 'mov'].includes(ext)) {
            renderedMedia += `<video src="${mediaUrl}" controls class="media-preview"></video>`;
        } else if (['opus', 'ogg', 'mp3', 'wav', 'm4a'].includes(ext)) {
            renderedMedia += `<audio src="${mediaUrl}" controls class="media-preview"></audio>`;
        } else {
            renderedMedia += `<a href="${mediaUrl}" download="${foundMediaKey}" class="doc-link">📄 ${escapeHtml(foundMediaKey)}</a>`;
        }
        cleanText = text.replace(foundMediaKey, '').replace('(file attached)', '').replace('<attached:', '').replace('>', '').trim();
    }

    if (cleanText) {
        let escapedText = escapeHtml(cleanText);
        // Apply highlight markup if regex is active
        if (highlightRegex) {
            escapedText = escapedText.replace(highlightRegex, '<mark>$1</mark>');
        }
        renderedMedia += `<span class="msg-text">${escapedText}</span>`;
    }

    return renderedMedia;
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escapes special characters for regex
}

// --- SEARCH ENGINE LOGIC ---

function executeSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    activeQuery = query;
    searchResults = [];
    currentSearchIndex = -1;

    const lowerQuery = query.toLowerCase();

    // Map all indices where the text occurs
    for (let i = 0; i < parsedMessages.length; i++) {
        const item = parsedMessages[i];
        if (item.type === 'msg' && item.text.toLowerCase().includes(lowerQuery)) {
            searchResults.push(i);
        }
    }

    if (searchResults.length > 0) {
        currentSearchIndex = 0;
        updateSearchUI();
        jumpToCurrentSearchResult();
    } else {
        searchResultText.innerText = '0 / 0';
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        clearBtn.disabled = false;
        alert('No matches found.');
    }
}

function updateSearchUI() {
    searchResultText.innerText = `${currentSearchIndex + 1} / ${searchResults.length}`;
    prevBtn.disabled = currentSearchIndex === 0;
    nextBtn.disabled = currentSearchIndex === searchResults.length - 1;
    clearBtn.disabled = false;
}

function clearSearchUI() {
    activeQuery = '';
    searchResults = [];
    currentSearchIndex = -1;
    searchInput.value = '';
    searchResultText.innerText = '';
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    clearBtn.disabled = true;
}

function jumpToCurrentSearchResult() {
    const targetGlobalIndex = searchResults[currentSearchIndex];
    
    // Clear DOM and load messages slightly before the target for context
    const container = document.getElementById('chat-container');
    container.innerHTML = '';
    
    currentlyRenderedIndex = Math.max(0, targetGlobalIndex - 10);
    renderNextBatch();
    
    // Smooth scroll to the specific element
    const targetEl = document.getElementById(`msg-${targetGlobalIndex}`);
    if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Temporarily highlight the bubble so the user's eye goes straight to it
        targetEl.classList.add('target-msg');
        setTimeout(() => {
            targetEl.classList.remove('target-msg');
        }, 1500);
    }
}

// Button and Enter Key Listeners
searchBtn.addEventListener('click', executeSearch);
searchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        executeSearch();
    }
});

nextBtn.addEventListener('click', () => {
    if (currentSearchIndex < searchResults.length - 1) {
        currentSearchIndex++;
        updateSearchUI();
        jumpToCurrentSearchResult();
    }
});

prevBtn.addEventListener('click', () => {
    if (currentSearchIndex > 0) {
        currentSearchIndex--;
        updateSearchUI();
        jumpToCurrentSearchResult();
    }
});

clearBtn.addEventListener('click', () => {
    clearSearchUI();
    // Reset view to the top of the chat
    const container = document.getElementById('chat-container');
    container.innerHTML = '';
    currentlyRenderedIndex = 0;
    renderNextBatch();
});

// Infinite scroll handler
const chatContainer = document.getElementById('chat-container');
chatContainer.addEventListener('scroll', () => {
    const isNearBottom = chatContainer.scrollTop + chatContainer.clientHeight >= chatContainer.scrollHeight - 100;
    
    if (isNearBottom && currentlyRenderedIndex < parsedMessages.length) {
        renderNextBatch();
    }
});