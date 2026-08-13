let parsedMessages = [];
let currentTopRenderedIndex = 0;
let currentBottomRenderedIndex = 0;
const BATCH_SIZE = 300;
let lastParsedDate = null;
let dateIndexMap = {}; 
let availableDates = [];

// Search State Variables
let searchResults = [];
let currentSearchIndex = -1;
let activeQuery = '';

const msgRegex = /^\[?(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})[, ]+([^\]]+)\]?\s*(?:-)?\s*(.*?):\s*(.*)$/;
const sysRegex = /^\[?(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})[, ]+([^\]]+)\]?\s*(?:-)?\s*(.*)$/;

// DOM Elements
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const clearBtn = document.getElementById('clearBtn');
const searchResultText = document.getElementById('searchResultText');
const datePicker = document.getElementById('datePicker');
const chatContainer = document.getElementById('chat-container');
const toastMsg = document.getElementById('toast-msg');

document.getElementById('txtFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const progressContainer = document.getElementById('progress-bar-container');
    const progressBar = document.getElementById('progress-bar');
    const statusText = document.getElementById('status-text');

    chatContainer.innerHTML = '';
    parsedMessages = [];
    dateIndexMap = {};
    availableDates = [];
    currentTopRenderedIndex = 0;
    currentBottomRenderedIndex = 0;
    lastParsedDate = null;
    
    searchInput.disabled = true;
    searchBtn.disabled = true;
    datePicker.disabled = true;
    datePicker.value = '';
    clearSearchUI();

    progressContainer.style.display = 'block';
    statusText.style.display = 'block'; 
    statusText.innerText = 'Reading text file...';
    progressBar.style.width = '40%';

    const reader = new FileReader();
    reader.onload = function(e) {
        statusText.innerText = 'Parsing chat messages...';
        progressBar.style.width = '80%';
        
        const textContent = e.target.result;
        const lines = textContent.split('\n');
        
        lines.forEach(line => processLine(line.trim()));

        progressBar.style.width = '100%';
        statusText.innerText = `Loaded ${parsedMessages.length.toLocaleString()} items.`;
        
        searchInput.disabled = false;
        searchBtn.disabled = false;
        datePicker.disabled = false;

        const allDates = Object.keys(dateIndexMap).sort();
        if (allDates.length > 0) {
            datePicker.min = allDates[0];
            datePicker.max = allDates[allDates.length - 1];
        }
        
        // Hide progress bar after 1 second
        setTimeout(() => { progressContainer.style.display = 'none'; }, 1000);
        
        // Hide status text after 5 seconds
        setTimeout(() => { statusText.style.display = 'none'; }, 5000);

        renderNextBatch();
    };
    reader.readAsText(file);
});

function normalizeDate(waDateStr) {
    const parts = waDateStr.split(/[\/\-\.]/);
    if (parts.length === 3) {
        let p1 = parseInt(parts[0], 10);
        let p2 = parseInt(parts[1], 10);
        let year = parts[2].trim();
        
        if (year.length === 2) year = "20" + year;
        
        let day = p1, month = p2;
        if (p1 > 12) { day = p1; month = p2; } 
        else if (p2 > 12) { day = p2; month = p1; }

        let dStr = day.toString().padStart(2, '0');
        let mStr = month.toString().padStart(2, '0');
        
        return `${year}-${mStr}-${dStr}`;
    }
    return null;
}

function processLine(line) {
    if (!line) return;
    const match = line.match(msgRegex);
    if (match) {
        const currentDate = match[1].trim(); 
        const timeOnly = match[2].trim();    
        const sender = match[3].trim();
        const text = match[4];

        if (currentDate !== lastParsedDate) {
            lastParsedDate = currentDate;
            parsedMessages.push({ type: 'date', dateText: currentDate });
            
            const normDate = normalizeDate(currentDate);
            if (normDate && dateIndexMap[normDate] === undefined) {
                dateIndexMap[normDate] = parsedMessages.length - 1;
            }
        }
        
        const isRight = sender.toLowerCase().includes('himanshu');
        parsedMessages.push({ type: 'msg', timestamp: timeOnly, sender: sender, text: text, isRight: isRight });
    } else {
        const sysMatch = line.match(sysRegex);
        if (sysMatch && parsedMessages.length === 0) {
            parsedMessages.push({ type: 'sys', text: sysMatch[3] });
        } else if (parsedMessages.length > 0) {
            parsedMessages[parsedMessages.length - 1].text += '\n' + line;
        }
    }
}

function createMessageNode(item, i, highlightRegex) {
    if (item.type === 'sys') {
        const div = document.createElement('div');
        div.className = 'system-msg';
        div.innerText = item.text;
        return div;
    } else if (item.type === 'date') {
        const div = document.createElement('div');
        div.className = 'date-badge';
        div.innerText = item.dateText;
        return div;
    } else {
        const div = document.createElement('div');
        div.className = `message ${item.isRight ? 'right' : 'left'}`;
        div.id = `msg-${i}`; 

        const senderSpan = `<span class="sender-name">${escapeHtml(item.sender)}</span>`;
        const timeSpan = `<span class="time">${escapeHtml(item.timestamp)}</span>`;
        const textContent = formatMessageText(item.text, highlightRegex);

        div.innerHTML = senderSpan + textContent + timeSpan;
        return div;
    }
}

function formatMessageText(text, highlightRegex) {
    let quotedHTML = '';
    let processingText = text;
    
    if (processingText.startsWith('> ')) {
        const lines = processingText.split('\n');
        let quoteLines = [];
        let replyLines = [];
        let isQuote = true;
        
        for (let l of lines) {
            if (isQuote && l.startsWith('> ')) {
                quoteLines.push(l.substring(2));
            } else if (isQuote && l.startsWith('>')) { 
                quoteLines.push(l.substring(1));
            } else {
                isQuote = false;
                replyLines.push(l);
            }
        }
        if (quoteLines.length > 0) {
            quotedHTML = `<div class="quoted-msg">${escapeHtml(quoteLines.join('\n'))}</div>`;
            processingText = replyLines.join('\n').trim();
        }
    } 
    else if (processingText.startsWith('“') && processingText.includes('”\n')) {
        const splitIndex = processingText.indexOf('”\n');
        const quotePart = processingText.substring(1, splitIndex);
        const replyPart = processingText.substring(splitIndex + 2);
        
        quotedHTML = `<div class="quoted-msg">${escapeHtml(quotePart)}</div>`;
        processingText = replyPart.trim();
    }

    // Clean up WhatsApp media tags with neat emojis
    processingText = processingText.replace(/image omitted/gi, '📷 Image omitted')
                                   .replace(/video omitted/gi, '🎥 Video omitted')
                                   .replace(/sticker omitted/gi, '🎫 Sticker omitted')
                                   .replace(/<Media omitted>/gi, '📷 Media omitted')
                                   .replace(/.*?\.(jpg|jpeg|png|gif|mp4|opus|m4a|pdf|docx?)\s*\(file attached\)/gi, '📎 File attached');

    let renderedHTML = '';
    if (processingText || quotedHTML) {
        let escapedText = escapeHtml(processingText);
        if (highlightRegex && escapedText) {
            escapedText = escapedText.replace(highlightRegex, '<mark>$1</mark>');
        }
        renderedHTML += quotedHTML;
        if (escapedText) {
            renderedHTML += `<span class="msg-text">${escapedText}</span>`;
        }
    }

    return renderedHTML;
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
}

function renderNextBatch() {
    if (currentBottomRenderedIndex >= parsedMessages.length) return;
    const endIndex = Math.min(currentBottomRenderedIndex + BATCH_SIZE, parsedMessages.length);
    const fragment = document.createDocumentFragment();

    let highlightRegex = null;
    if (activeQuery) highlightRegex = new RegExp(`(${escapeRegExp(activeQuery)})`, 'gi');

    for (let i = currentBottomRenderedIndex; i < endIndex; i++) {
        fragment.appendChild(createMessageNode(parsedMessages[i], i, highlightRegex));
    }
    chatContainer.appendChild(fragment);
    currentBottomRenderedIndex = endIndex;
}

function renderPrevBatch() {
    if (currentTopRenderedIndex <= 0) return;
    const startIndex = Math.max(0, currentTopRenderedIndex - BATCH_SIZE);
    const endIndex = currentTopRenderedIndex;
    const fragment = document.createDocumentFragment();

    let highlightRegex = null;
    if (activeQuery) highlightRegex = new RegExp(`(${escapeRegExp(activeQuery)})`, 'gi');

    for (let i = startIndex; i < endIndex; i++) {
        fragment.appendChild(createMessageNode(parsedMessages[i], i, highlightRegex));
    }

    const oldScrollHeight = chatContainer.scrollHeight;
    const oldScrollTop = chatContainer.scrollTop;
    chatContainer.prepend(fragment);
    
    const newScrollHeight = chatContainer.scrollHeight;
    chatContainer.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
    currentTopRenderedIndex = startIndex;
}

function showToast() {
    toastMsg.classList.add('show');
    setTimeout(() => {
        toastMsg.classList.remove('show');
    }, 1500); 
}

datePicker.addEventListener('change', function(e) {
    const selectedDate = e.target.value; 
    if (!selectedDate) return;

    if (dateIndexMap[selectedDate] !== undefined) {
        const targetIndex = dateIndexMap[selectedDate];
        clearSearchUI();
        
        chatContainer.innerHTML = '';
        currentTopRenderedIndex = targetIndex;
        currentBottomRenderedIndex = targetIndex;
        renderNextBatch();
        
        chatContainer.scrollTop = 0;
    } else {
        showToast();
        datePicker.value = ''; 
    }
});

function executeSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    activeQuery = query;
    searchResults = [];
    currentSearchIndex = -1;

    const lowerQuery = query.toLowerCase();

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
    chatContainer.innerHTML = '';
    
    currentTopRenderedIndex = Math.max(0, targetGlobalIndex - 50);
    currentBottomRenderedIndex = currentTopRenderedIndex;
    renderNextBatch();
    
    const targetEl = document.getElementById(`msg-${targetGlobalIndex}`);
    if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'auto', block: 'center' });
        targetEl.classList.add('target-msg');
        setTimeout(() => {
            targetEl.classList.remove('target-msg');
        }, 1500);
    }
}

searchBtn.addEventListener('click', executeSearch);
searchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') executeSearch();
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
    chatContainer.innerHTML = '';
    currentTopRenderedIndex = 0;
    currentBottomRenderedIndex = 0;
    renderNextBatch();
});

const searchToggleBtn = document.getElementById('searchToggleBtn');
const searchBoxContainer = document.getElementById('searchBoxContainer');

searchToggleBtn.addEventListener('click', () => {
    if (searchBoxContainer.style.display === 'none' || searchBoxContainer.style.display === '') {
        searchBoxContainer.style.display = 'flex';
        if (!searchInput.disabled) searchInput.focus();
    } else {
        searchBoxContainer.style.display = 'none';
    }
});

chatContainer.addEventListener('scroll', () => {
    const isNearBottom = chatContainer.scrollTop + chatContainer.clientHeight >= chatContainer.scrollHeight - 150;
    if (isNearBottom && currentBottomRenderedIndex < parsedMessages.length) {
        renderNextBatch();
    }

    const isNearTop = chatContainer.scrollTop <= 150;
    if (isNearTop && currentTopRenderedIndex > 0) {
        renderPrevBatch();
    }
});
