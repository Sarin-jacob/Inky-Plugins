const CORS_PROXY = 'https://corsproxy.io/?';

// --- Core State & Configuration ---
let config = {
    inkyUrl: localStorage.getItem('inkyUrl') || 'http://inky.local',
    interval: parseInt(localStorage.getItem('inkyInterval')) || 15,
    apiKeys: JSON.parse(localStorage.getItem('inkyApiKeys')) || {},
    activePluginId: localStorage.getItem('inkyActivePlugin') || 'hello_world'
};

let renderTimer = null;
let lastFrameData = null;
const canvas = document.getElementById('inkyCanvas');
const ctx = canvas.getContext('2d');

//canvas utilities
const canvasUtils = {
    /**
     * Shrinks font size until the text fits within maxWidth.
     * Returns the final font size used.
     */
    fitTextSingleLine: (ctx, text, x, y, maxWidth, maxFontSize, weight = 'normal', font = 'Arial') => {
        let size = maxFontSize;
        ctx.font = `${weight} ${size}px ${font}`;
        
        // Shrink font size until it fits or hits a minimum readable size (10px)
        while (ctx.measureText(text).width > maxWidth && size > 10) {
            size--;
            ctx.font = `${weight} ${size}px ${font}`;
        }
        
        ctx.fillText(text, x, y);
        return size;
    },

    /**
     * Wraps text into multiple lines. Useful for quotes or descriptions.
     * Returns the final Y position after drawing all lines.
     */
    wrapText: (ctx, text, x, y, maxWidth, lineHeight) => {
        const words = text.split(' ');
        let line = '';
        let currentY = y;

        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            const testWidth = metrics.width;
            
            if (testWidth > maxWidth && n > 0) {
                ctx.fillText(line, x, currentY);
                line = words[n] + ' ';
                currentY += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, x, currentY);
        return currentY;
    }
};

// --- Plugin Registry ---
// To add a new plugin, just add an object to this array.
const Plugins = [
    {
        id: 'hello_world',
        name: 'Basic: Hello Inky',
        description: 'A simple text display to test connection.',
        requiredKeys: [], // No API keys needed
        render: async (ctx, width, height, apiKeys) => {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            
            ctx.fillStyle = 'black';
            ctx.font = 'bold 60px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Hello from Inky Hub!', width / 2, height / 2 - 20);
            
            ctx.font = '30px Arial';
            ctx.fillText(`Time: ${new Date().toLocaleTimeString()}`, width / 2, height / 2 + 40);
        }
    },
    {
        id: 'arxiv_ai',
        name: 'Researcher: ArXiv AI Latest',
        description: 'Fetches the 3 latest cs.AI papers.',
        requiredKeys: [], 
        render: async (ctx, width, height, apiKeys) => {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = 'black';
            
            // Using the new smart text to ensure the header never breaks
            canvasUtils.fitTextSingleLine(ctx, 'Latest AI Research (cs.AI)', 30, 60, width - 60, 40, 'bold');
            ctx.fillRect(30, 80, width - 60, 4); 

            try {
                const targetUrl = 'https://export.arxiv.org/api/query?search_query=cat:cs.AI&max_results=3&sortBy=submittedDate&sortOrder=descending';
                const proxiedUrl = `${CORS_PROXY}${encodeURIComponent(targetUrl)}`;
                
                const res = await fetch(proxiedUrl);
                const text = await res.text();
                const parser = new DOMParser();
                const xml = parser.parseFromString(text, "text/xml");
                const entries = xml.querySelectorAll('entry');

                let yPos = 140;
                entries.forEach((entry, index) => {
                    let title = entry.querySelector('title').textContent.trim().replace(/\s+/g, ' ');
                    let author = entry.querySelector('author name').textContent;
                    
                    // Use smart text for titles so we don't need manual truncation anymore
                    ctx.fillStyle = 'black';
                    canvasUtils.fitTextSingleLine(ctx, `${index + 1}. ${title}`, 30, yPos, width - 60, 28, 'bold');
                    
                    ctx.fillStyle = '#333'; // Slightly lighter for authors (will dither nicely)
                    canvasUtils.fitTextSingleLine(ctx, `By: ${author}`, 60, yPos + 35, width - 90, 22, 'italic');
                    
                    yPos += 100;
                });
            } catch (err) {
                canvasUtils.fitTextSingleLine(ctx, 'Error fetching ArXiv data.', 30, 150, width - 60, 30);
                console.error(err);
            }
        }
    },
    {
        id: 'hn_top',
        name: 'Tech: Hacker News Top',
        description: 'Fetches the top 4 stories from Y Combinator.',
        requiredKeys: [], 
        render: async (ctx, width, height, apiKeys) => {
            ctx.fillStyle = 'white'; 
            ctx.fillRect(0, 0, width, height);
            
            ctx.fillStyle = 'black';
            canvasUtils.fitTextSingleLine(ctx, 'Hacker News Top Stories', 30, 60, width - 60, 40, 'bold');
            ctx.fillRect(30, 80, width - 60, 4);

            try {
                // HN provides a free, CORS-friendly Firebase API
                const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
                const topIds = (await res.json()).slice(0, 4);
                
                let yPos = 140;
                for (let i = 0; i < topIds.length; i++) {
                    const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${topIds[i]}.json`);
                    const item = await itemRes.json();
                    
                    ctx.fillStyle = 'black';
                    canvasUtils.fitTextSingleLine(ctx, `${i + 1}. ${item.title}`, 30, yPos, width - 60, 28, 'bold');
                    
                    ctx.fillStyle = '#333';
                    canvasUtils.fitTextSingleLine(ctx, `${item.score} pts by ${item.by}`, 60, yPos + 35, width - 90, 22, 'italic');
                    
                    yPos += 85;
                }
            } catch (err) {
                ctx.fillStyle = 'black';
                canvasUtils.fitTextSingleLine(ctx, 'Error fetching Hacker News.', 30, 150, width - 60, 30);
            }
        }
    },
    {
        id: 'weather_dashboard',
        name: 'Utility: Current Weather',
        description: 'Needs OpenWeather API key and City Name.',
        requiredKeys: ['OpenWeather_API_Key', 'City_Name'], 
        render: async (ctx, width, height, apiKeys) => {
            ctx.fillStyle = 'white'; 
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = 'black';
            
            const key = apiKeys['OpenWeather_API_Key'];
            // Default to Khordha if they leave it blank, since that's local context
            const city = apiKeys['City_Name'] || 'Khordha'; 

            try {
                const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${key}&units=metric`;
                const res = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`);
                if (!res.ok) throw new Error('API Request Failed');
                
                const data = await res.json();

                // Draw huge temperature centered
                ctx.textAlign = 'center';
                canvasUtils.fitTextSingleLine(ctx, `${Math.round(data.main.temp)}°C`, width / 2, 220, width - 40, 140, 'bold');
                
                // Draw City and Condition
                canvasUtils.fitTextSingleLine(ctx, data.name.toUpperCase(), width / 2, 300, width - 40, 40, 'bold');
                canvasUtils.fitTextSingleLine(ctx, data.weather[0].description, width / 2, 350, width - 40, 30, 'normal');
                
                // Footer details
                ctx.font = '24px Arial';
                ctx.fillText(`Humidity: ${data.main.humidity}%  |  Wind: ${data.wind.speed} m/s`, width / 2, 420);
                
                // Reset text align for the next render cycle
                ctx.textAlign = 'left';

            } catch (err) {
                ctx.textAlign = 'left';
                canvasUtils.fitTextSingleLine(ctx, 'Weather Error. Check API Key & City Name.', 30, 150, width - 60, 30);
            }
        }
    },
    {
        id: 'github_activity',
        name: 'Tech: GitHub Recent Commits',
        description: 'Shows latest commits. Needs Repo format (user/repo).',
        requiredKeys: ['Target_GitHub_Repo'], 
        render: async (ctx, width, height, apiKeys) => {
            ctx.fillStyle = 'white'; 
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = 'black';
            
            // Default to your Inky repo if blank
            const repo = apiKeys['Target_GitHub_Repo'] || 'Sarin-jacob/Inky'; 
            
            canvasUtils.fitTextSingleLine(ctx, `Recent Commits: ${repo}`, 30, 60, width - 60, 40, 'bold');
            ctx.fillRect(30, 80, width - 60, 4);

            try {
                const res = await fetch(`https://api.github.com/repos/${repo}/commits`);
                const commits = (await res.json()).slice(0, 4);
                
                let yPos = 140;
                commits.forEach((c, index) => {
                    // Grab just the first line of the commit message
                    const msg = c.commit.message.split('\n')[0]; 
                    const author = c.commit.author.name;
                    const date = new Date(c.commit.author.date).toLocaleDateString();
                    
                    ctx.fillStyle = 'black';
                    canvasUtils.fitTextSingleLine(ctx, `${index + 1}. ${msg}`, 30, yPos, width - 60, 28, 'bold');
                    
                    ctx.fillStyle = '#333';
                    canvasUtils.fitTextSingleLine(ctx, `${author} committed on ${date}`, 60, yPos + 35, width - 90, 22, 'italic');
                    
                    yPos += 85;
                });
            } catch (err) {
                canvasUtils.fitTextSingleLine(ctx, 'Error fetching GitHub Repo. Is it public?', 30, 150, width - 60, 30);
            }
        }
    },
    {
        id: 'naruto_quotes',
        name: 'Aesthetic: Naruto Wisdom',
        description: 'Random quote generator using multi-line wrap.',
        requiredKeys: [], 
        render: async (ctx, width, height, apiKeys) => {
            // A small sample, you can replace this by fetching your 500+ CSV later
            const quotes = [
                { text: "Hard work is worthless for those that don't believe in themselves.", author: "Naruto Uzumaki" },
                { text: "Knowing what it feels to be in pain, is exactly why we try to be kind to others.", author: "Jiraiya" },
                { text: "When people are protecting something truly special to them, they truly can become as strong as they can be.", author: "Haku" },
                { text: "If you don't like your destiny, don't accept it. Instead have the courage to change it.", author: "Naruto Uzumaki" }
            ];
            
            const q = quotes[Math.floor(Math.random() * quotes.length)];
            
            ctx.fillStyle = 'white'; 
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = 'black';
            
            // Giant decorative quote mark in the background
            ctx.fillStyle = '#ddd'; // Will dither to a light dot pattern
            ctx.font = 'bold 250px Arial';
            ctx.fillText('"', 50, 220);
            
            ctx.fillStyle = 'black';
            ctx.font = 'bold 45px Arial';
            
            // Using the new wrapText utility: (ctx, text, x, y, maxWidth, lineHeight)
            const finalY = canvasUtils.wrapText(ctx, q.text, 100, 180, width - 150, 60);
            
            ctx.textAlign = 'right';
            ctx.font = 'italic 30px Arial';
            ctx.fillText(`- ${q.author}`, width - 100, finalY + 80);
            
            ctx.textAlign = 'left'; // Always reset
        }
    }
];

// --- Core Functions ---

function init() {
    renderPluginList();
    buildApiKeyInputs();
    runLoop();
    
    // Event Listeners
    document.getElementById('pushNowBtn').addEventListener('click', forceUpdate);
    document.getElementById('settingsBtn').addEventListener('click', () => {
        document.getElementById('inkyUrlInput').value = config.inkyUrl;
        document.getElementById('intervalInput').value = config.interval;
        document.getElementById('settingsModal').classList.remove('hidden');
    });
    document.getElementById('closeSettingsBtn').addEventListener('click', () => {
        document.getElementById('settingsModal').classList.add('hidden');
    });
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
}

function renderPluginList() {
    const list = document.getElementById('pluginList');
    list.innerHTML = '';
    
    Plugins.forEach(plugin => {
        const div = document.createElement('div');
        const isActive = plugin.id === config.activePluginId;
        div.className = `p-3 border rounded cursor-pointer transition ${isActive ? 'bg-black text-white' : 'hover:bg-gray-100'}`;
        div.innerHTML = `
            <div class="font-bold">${plugin.name}</div>
            <div class="text-sm ${isActive ? 'text-gray-300' : 'text-gray-500'}">${plugin.description}</div>
        `;
        div.onclick = () => {
            config.activePluginId = plugin.id;
            localStorage.setItem('inkyActivePlugin', plugin.id);
            renderPluginList(); // re-render to update UI colors
            forceUpdate(); // immediate preview
        };
        list.appendChild(div);
    });
}

function buildApiKeyInputs() {
    const container = document.getElementById('apiKeysContainer');
    container.innerHTML = '';
    
    const allRequiredKeys = new Set();
    Plugins.forEach(p => p.requiredKeys.forEach(k => allRequiredKeys.add(k)));
    
    allRequiredKeys.forEach(key => {
        const wrapper = document.createElement('div');
        const hasKey = !!config.apiKeys[key];
        const placeholderText = hasKey ? '(unchanged)' : 'Enter API Key';
        
        wrapper.innerHTML = `
            <label class="block text-sm font-medium mb-1">${key}</label>
            <input type="password" data-key="${key}" class="apikey-input w-full border p-2 rounded text-sm" placeholder="${placeholderText}">
        `;
        container.appendChild(wrapper);
    });
}

function saveSettings() {
    config.inkyUrl = document.getElementById('inkyUrlInput').value;
    config.interval = parseInt(document.getElementById('intervalInput').value);
    
    const keyInputs = document.querySelectorAll('.apikey-input');
    keyInputs.forEach(input => {
        const val = input.value.trim();
        if (val !== '') {
            config.apiKeys[input.getAttribute('data-key')] = val;
        }
    });

    localStorage.setItem('inkyUrl', config.inkyUrl);
    localStorage.setItem('inkyInterval', config.interval);
    localStorage.setItem('inkyApiKeys', JSON.stringify(config.apiKeys));
    
    document.getElementById('settingsModal').classList.add('hidden');
    
    // Reset timer with new interval
    runLoop();
}

async function forceUpdate() {
    await renderActivePlugin();
    await pushToInky();
}

function runLoop() {
    if (renderTimer) clearInterval(renderTimer);
    forceUpdate();
    renderTimer = setInterval(forceUpdate, config.interval * 1000);
}

async function renderActivePlugin() {
    setStatus('Rendering...');
    const plugin = Plugins.find(p => p.id === config.activePluginId) || Plugins[0];
    
    // Check missing keys
    const missingKeys = plugin.requiredKeys.filter(k => !config.apiKeys[k]);
    if (missingKeys.length > 0) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, 800, 480);
        ctx.fillStyle = 'black';
        ctx.font = '30px Arial';
        ctx.fillText(`Missing API Keys: ${missingKeys.join(', ')}`, 50, 100);
        ctx.fillText('Please add them in Settings.', 50, 150);
        setStatus('Key Missing');
        return;
    }

    await plugin.render(ctx, 800, 480, config.apiKeys);
    setStatus('Ready to Push');
}

async function pushToInky() {
    setStatus('Checking Frame...');
    const currentFrameData = canvas.toDataURL('image/png');
    
    // Check if the frame is identical to the last one we pushed
    if (currentFrameData === lastFrameData) {
        setStatus(`Skipped (No Changes) at ${new Date().toLocaleTimeString()}`);
        return; // Abort push to save bandwidth and hardware wear
    }
    setStatus('Pushing...');
    
    canvas.toBlob(async (blob) => {
        const formData = new FormData();
        formData.append('image', blob, 'dashboard.png');
        
        try {
            const res = await fetch(`${config.inkyUrl}/api/push_image`, {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                lastFrameData = currentFrameData;
                setStatus(`Success (${new Date().toLocaleTimeString()})`);
            } else {
                setStatus('Push Failed');
            }
        } catch (err) {
            setStatus('Connection Error');
            console.error(err);
        }
    }, 'image/png');
}

function setStatus(msg) {
    document.getElementById('statusIndicator').innerText = msg;
}

// Start everything up
init();