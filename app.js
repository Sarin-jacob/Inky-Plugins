// --- Core State & Configuration ---
let config = {
    inkyUrl: localStorage.getItem('inkyUrl') || 'http://inky.local',
    interval: parseInt(localStorage.getItem('inkyInterval')) || 15,
    apiKeys: JSON.parse(localStorage.getItem('inkyApiKeys')) || {},
    activePluginId: localStorage.getItem('inkyActivePlugin') || 'hello_world'
};

let renderTimer = null;
const canvas = document.getElementById('inkyCanvas');
const ctx = canvas.getContext('2d');

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
            // Fill background white
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);

            ctx.fillStyle = 'black';
            ctx.font = 'bold 40px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('Latest AI Research (cs.AI)', 30, 60);
            ctx.fillRect(30, 80, width - 60, 4); // separator line

            try {
                // Fetch from ArXiv API (XML format)
                const res = await fetch('https://export.arxiv.org/api/query?search_query=cat:cs.AI&max_results=3&sortBy=submittedDate&sortOrder=descending');
                const text = await res.text();
                const parser = new DOMParser();
                const xml = parser.parseFromString(text, "text/xml");
                const entries = xml.querySelectorAll('entry');

                let yPos = 140;
                entries.forEach((entry, index) => {
                    let title = entry.querySelector('title').textContent.trim().replace(/\s+/g, ' ');
                    let author = entry.querySelector('author name').textContent;
                    
                    // Truncate long titles
                    if (title.length > 80) title = title.substring(0, 77) + '...';

                    ctx.font = 'bold 28px Arial';
                    ctx.fillText(`${index + 1}. ${title}`, 30, yPos);
                    ctx.font = 'italic 22px Arial';
                    ctx.fillText(`By: ${author}`, 60, yPos + 35);
                    yPos += 100;
                });
            } catch (err) {
                ctx.font = '30px Arial';
                ctx.fillText('Error fetching ArXiv data.', 30, 150);
            }
        }
    },
    {
        id: 'weather_basic',
        name: 'Utility: Current Weather',
        description: 'Needs OpenWeather API key.',
        requiredKeys: ['OpenWeather'], 
        render: async (ctx, width, height, apiKeys) => {
            const key = apiKeys['OpenWeather'];
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = 'black';
            ctx.font = '40px Arial';
            ctx.fillText(`Weather API Key Setup: ${key ? 'Found' : 'Missing'}`, 50, 100);
            // Real fetch logic would go here
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
    
    // Collect all unique keys needed across all plugins
    const allRequiredKeys = new Set();
    Plugins.forEach(p => p.requiredKeys.forEach(k => allRequiredKeys.add(k)));
    
    allRequiredKeys.forEach(key => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <label class="block text-xs font-medium">${key}</label>
            <input type="text" data-key="${key}" class="apikey-input w-full border p-2 rounded text-sm" value="${config.apiKeys[key] || ''}">
        `;
        container.appendChild(wrapper);
    });
}

function saveSettings() {
    config.inkyUrl = document.getElementById('inkyUrlInput').value;
    config.interval = parseInt(document.getElementById('intervalInput').value);
    
    const keyInputs = document.querySelectorAll('.apikey-input');
    keyInputs.forEach(input => {
        if (input.value.trim() !== '') {
            config.apiKeys[input.getAttribute('data-key')] = input.value.trim();
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