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
     * Shrinks font size until a single line of text fits within maxWidth.
     */
    fitTextSingleLine: (ctx, text, x, y, maxWidth, maxFontSize, weight = 'normal', font = 'Arial') => {
        let size = maxFontSize;
        ctx.font = `${weight} ${size}px ${font}`;
        
        while (ctx.measureText(text).width > maxWidth && size > 10) {
            size--;
            ctx.font = `${weight} ${size}px ${font}`;
        }
        
        ctx.fillText(text, x, y);
        return size;
    },

    /**
     * Standard text wrap. Useful when you know the text is short enough to not overflow Y.
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
    },

    /**
     * The heavy lifter: Shrinks font size until a multi-line paragraph fits 
     * inside both maxWidth AND maxHeight.
     */
    fitTextMultiLine: (ctx, text, x, y, maxWidth, maxHeight, maxFontSize, weight = 'normal', font = 'Arial', lineSpacing = 1.2) => {
        let size = maxFontSize;
        let lines = [];
        let lineHeight = size * lineSpacing;

        // Helper function to calculate wrapping at a specific font size
        const calculateLines = (testSize) => {
            ctx.font = `${weight} ${testSize}px ${font}`;
            const words = text.split(' ');
            let currentLines = [];
            let currentLine = '';

            for (let n = 0; n < words.length; n++) {
                const testLine = currentLine + words[n] + ' ';
                const metrics = ctx.measureText(testLine);
                
                if (metrics.width > maxWidth && n > 0) {
                    currentLines.push(currentLine.trim());
                    currentLine = words[n] + ' ';
                } else {
                    currentLine = testLine;
                }
            }
            currentLines.push(currentLine.trim());
            return currentLines;
        };

        // Shrink loop: Check total height against maxHeight
        while (size > 10) {
            lineHeight = size * lineSpacing;
            lines = calculateLines(size);
            const totalHeight = lines.length * lineHeight;

            if (totalHeight <= maxHeight) {
                break; // It fits perfectly!
            }
            size--; // Shrink font and try again
        }

        // Draw the final calculated lines
        ctx.font = `${weight} ${size}px ${font}`;
        ctx.textBaseline = 'top'; // Makes Y coordinate the top of the bounding box
        
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], x, y + (i * lineHeight));
        }
        
        ctx.textBaseline = 'alphabetic'; // Reset to canvas default safely
        
        return { sizeUsed: size, totalHeight: lines.length * lineHeight };
    }
};

// --- Plugin Registry ---
// To add a new plugin, just add an object to this array.
const Plugins = [
    {
        id: 'hello_world',
        name: 'Basic: Hello Inky',
        minInterval : 10,
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
        theme: 'AI & Research', // <-- New Theme Property
        name: 'ArXiv AI Latest',
        description: 'Fetches the 3 latest cs.AI papers.',
        minInterval: 3600, 
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
        minInterval: 300,
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
        theme: 'Daily Utility', // <-- New Theme Property
        name: 'Current Weather',
        description: 'Needs OpenWeather API key and City Name.',
        minInterval: 3600,
        requiredKeys: [
            { id: 'openweather_key', type: 'password', label: 'OpenWeather API Key' },
            { id: 'city_name', type: 'text', label: 'City Name', placeholder: 'e.g., Khordha, IN' }
        ],
        render: async (ctx, width, height, apiKeys) => {
            ctx.fillStyle = 'white'; 
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = 'black';
            
            const key = apiKeys['openweather_key'];
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
        theme: 'Tech & Dev', 
        name: 'GitHub Recent Commits',
        description: 'Shows latest commits for a specific repo.',
        minInterval: 300,
        requiredKeys: [
            { id: 'github_repo', type: 'text', label: 'Target Repo (user/repo)', placeholder: 'e.g., Sarin-jacob/Inky' },
            { id: 'commit_count', type: 'number', label: 'Number of Commits', placeholder: 'e.g., 4' }
        ],
        render: async (ctx, width, height, apiKeys) => {
            ctx.fillStyle = 'white'; 
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = 'black';
            
            // Default to your Inky repo if blank
            const repo = apiKeys['github_repo'] || 'Sarin-jacob/Inky'; 
            // Parse as integer to ensure .slice() and our math works correctly
            const commit_count = parseInt(apiKeys['commit_count']) || 4;
            
            canvasUtils.fitTextSingleLine(ctx, `Recent Commits: ${repo}`, 30, 60, width - 60, 40, 'bold');
            ctx.fillRect(30, 80, width - 60, 4);

            try {
                const res = await fetch(`https://api.github.com/repos/${repo}/commits`);
                const data = await res.json();
                
                // Prevent crash if GitHub returns an error object (like rate limit hit or 404)
                if (!Array.isArray(data)) throw new Error('Invalid repo or rate limit reached.');

                const commits = data.slice(0, commit_count);
                
                // Dynamically calculate vertical spacing so it never overflows the 480px canvas height
                const availableHeight = height - 120; // Leave room for the header
                const ySpacing = Math.min(85, availableHeight / commit_count);
                
                let yPos = 120; 
                commits.forEach((c, index) => {
                    // Grab just the first line of the commit message
                    const msg = c.commit.message.split('\n')[0]; 
                    const author = c.commit.author.name;
                    const date = new Date(c.commit.author.date).toLocaleDateString();
                    
                    ctx.fillStyle = 'black';
                    // Font size scales down slightly if we are packing a lot of commits into the screen
                    const titleSize = Math.min(28, ySpacing * 0.45);
                    canvasUtils.fitTextSingleLine(ctx, `${index + 1}. ${msg}`, 30, yPos, width - 60, titleSize, 'bold');
                    
                    ctx.fillStyle = '#333';
                    const subSize = Math.min(22, ySpacing * 0.35);
                    canvasUtils.fitTextSingleLine(ctx, `${author} committed on ${date}`, 60, yPos + (ySpacing * 0.4), width - 90, subSize, 'italic');
                    
                    yPos += ySpacing;
                });
            } catch (err) {
                canvasUtils.fitTextSingleLine(ctx, 'Error fetching GitHub Repo. Is it public?', 30, 150, width - 60, 30);
                console.error(err);
            }
        }
    },
    {
        id: 'naruto_quotes',
        theme: 'Fun & Aesthetic', // <-- New Theme Property
        name: 'Naruto Wisdom',
        description: 'Random quote generator using multi-line wrap.',
        minInterval: 60,
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
    },
    {
        id: 'conway_life',
        theme: 'Fun & Aesthetic',
        name: 'Conway\'s Game of Life',
        description: 'Zero-player cellular automaton. Evolves every update.',
        minInterval: 5, // Faster updates look cool for automata
        requiredKeys: [], 
        grid: null, // We store the state right here in the plugin object
        cols: 50, // 800px / 16px
        rows: 30, // 480px / 16px
        cellSize: 16,
        render: async function(ctx, width, height, apiKeys) { 
            // Note: using 'function' instead of '() =>' so 'this' refers to the plugin object
            
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = 'black';

            // 1. Initialize random grid on first run or if it died out
            if (!this.grid) {
                this.grid = Array(this.cols).fill().map(() => 
                    Array(this.rows).fill(0).map(() => Math.random() > 0.85 ? 1 : 0)
                );
            }

            let activeCells = 0;

            // 2. Draw current grid
            for(let i = 0; i < this.cols; i++) {
                for(let j = 0; j < this.rows; j++) {
                    if(this.grid[i][j]) {
                        // Drawing rectangles with a 1px gap for a cool grid effect
                        ctx.fillRect((i * this.cellSize) + 1, (j * this.cellSize) + 1, this.cellSize - 2, this.cellSize - 2);
                        activeCells++;
                    }
                }
            }

            // 3. Calculate next generation
            let nextGen = Array(this.cols).fill().map(() => Array(this.rows).fill(0));
            for(let i = 0; i < this.cols; i++) {
                for(let j = 0; j < this.rows; j++) {
                    let state = this.grid[i][j];
                    let neighbors = 0;
                    
                    // Count 8 neighbors with wrapping edges (toroidal array)
                    for(let x = -1; x <= 1; x++) {
                        for(let y = -1; y <= 1; y++) {
                            if(x === 0 && y === 0) continue;
                            let col = (i + x + this.cols) % this.cols;
                            let row = (j + y + this.rows) % this.rows;
                            neighbors += this.grid[col][row];
                        }
                    }
                    
                    // Conway's Rules
                    if (state === 0 && neighbors === 3) nextGen[i][j] = 1;
                    else if (state === 1 && (neighbors < 2 || neighbors > 3)) nextGen[i][j] = 0;
                    else nextGen[i][j] = state;
                }
            }
            
            this.grid = nextGen;

            // Reset the grid if it completely dies so the screen isn't just blank forever
            if (activeCells === 0) this.grid = null; 
        }
    },
    {
        id: 'cricket_live',
        theme: 'Sports & Live Events',
        name: 'Live Cricket Scores',
        description: 'Displays current match. Needs free key from cricketdata.org.',
        minInterval: 60,
        requiredKeys: [
            { id: 'cricketdata_key', type: 'password', label: 'CricketData.org API Key' }
        ],
        render: async (ctx, width, height, apiKeys) => {
            const key = apiKeys['cricketdata_key'];
            
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = 'black';
            
            canvasUtils.fitTextSingleLine(ctx, 'Live Cricket', 30, 60, width - 60, 40, 'bold');
            ctx.fillRect(30, 80, width - 60, 4);

            try {
                // Fetch current matches
                const url = `https://api.cricapi.com/v1/currentMatches?apikey=${key}&offset=0`;
                const res = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`);
                const data = await res.json();

                if (!data.data || data.data.length === 0) {
                    canvasUtils.fitTextSingleLine(ctx, 'No live matches right now.', 30, 150, width - 60, 35);
                    return;
                }

                // Grab the first most relevant match
                const match = data.data[0];
                let yPos = 140;

                // Match Title (e.g., India vs Australia)
                canvasUtils.fitTextSingleLine(ctx, match.name, 30, yPos, width - 60, 35, 'bold');
                yPos += 60;

                // Loop through innings if scores exist
                if (match.score && match.score.length > 0) {
                    match.score.forEach(inning => {
                        const scoreText = `${inning.inning}: ${inning.r}/${inning.w} (${inning.o} ov)`;
                        canvasUtils.fitTextSingleLine(ctx, scoreText, 30, yPos, width - 60, 45, 'bold');
                        yPos += 60;
                    });
                } else {
                    canvasUtils.fitTextSingleLine(ctx, 'Match starting soon...', 30, yPos, width - 60, 30, 'italic');
                    yPos += 60;
                }

                // Match Status (e.g., "India require 34 runs to win from 12 balls")
                // Using the multi-line utility because these statuses can be extremely long
                ctx.fillStyle = '#333';
                canvasUtils.fitTextMultiLine(ctx, match.status, 30, yPos + 20, width - 60, height - yPos - 40, 30, 'italic');

            } catch (err) {
                canvasUtils.fitTextMultiLine(ctx, 'Error fetching Cricket Data. Check your API key limits or proxy status.', 30, 150, width - 60, height - 200, 30);
                console.error(err);
            }
        }
    },
    {
        id: 'huggingface_trending',
        theme: 'AI & Research',
        name: 'Hugging Face Trending',
        description: 'Top trending AI models from Hugging Face.',
        minInterval: 3600, // 1 Hour (Trending doesn't change every 5 mins)
        requiredKeys: [],
        render: async (ctx, width, height, apiKeys) => {
            ctx.fillStyle = 'white'; 
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = 'black';
            
            canvasUtils.fitTextSingleLine(ctx, 'Trending AI Models (Hugging Face)', 30, 60, width - 60, 40, 'bold');
            ctx.fillRect(30, 80, width - 60, 4);

            try {
                // Hugging Face has a free, public API for this
                const res = await fetch(`${CORS_PROXY}${encodeURIComponent('https://huggingface.co/models-json?sort=trending&withCount=true')}`);
                const data = await res.json();
                const models=data["models"].slice(0,4);
                console.log(models);
                let yPos = 140;
                models.forEach((m, index) => {
                    // Extract model name and task (e.g., text-generation, image-classification)
                    let name = m.id;
                    let task = m.pipeline_tag ? m.pipeline_tag.toUpperCase() : 'UNKNOWN TASK';
                    let downloads = m.downloads ? m.downloads.toLocaleString() : 'N/A';
                    
                    ctx.fillStyle = 'black';
                    canvasUtils.fitTextSingleLine(ctx, `${index + 1}. ${name}`, 30, yPos, width - 60, 28, 'bold');
                    
                    ctx.fillStyle = '#333';
                    canvasUtils.fitTextSingleLine(ctx, `[${task}] | DLs: ${downloads}`, 60, yPos + 35, width - 90, 22, 'italic');
                    
                    yPos += 85;
                });
            } catch (err) {
                canvasUtils.fitTextSingleLine(ctx, 'Error fetching Hugging Face data.', 30, 150, width - 60, 30);
                console.error(err);
            }
        }
    },
    {
        id: 'latex_daily',
        theme: 'AI & Research',
        name: 'ML Equation of the Day',
        description: 'Displays a beautiful AI/ML equation in LaTeX.',
        minInterval: 3600, // 1 hour
        requiredKeys: [],
        render: async (ctx, width, height, apiKeys) => {
            // A curated list of beautiful ML equations
            const equations = [
                { title: "Scaled Dot-Product Attention (Transformers)", formula: "\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V" },
                { title: "Kullback-Leibler Divergence", formula: "D_{KL}(P||Q) = \\sum_{x} P(x) \\log\\left(\\frac{P(x)}{Q(x)}\right)" },
                { title: "Backpropagation (Chain Rule)", formula: "\\frac{\\partial E}{\\partial w_{ij}} = \\frac{\\partial E}{\\partial o_j} \\frac{\\partial o_j}{\\partial net_j} \\frac{\\partial net_j}{\\partial w_{ij}}" },
                { title: "Bayes' Theorem", formula: "P(A|B) = \\frac{P(B|A)P(A)}{P(B)}" },
                { title: "Mean Squared Error (MSE)", formula: "\\text{MSE} = \\frac{1}{n}\\sum_{i=1}^n(Y_i - \\hat{Y}_i)^2" },
                { title: "Sigmoid Activation", formula: "\\sigma(x) = \\frac{1}{1 + e^{-x}}" }
            ];
            
            // Pick a random equation
            const eq = equations[Math.floor(Math.random() * equations.length)];
            
            ctx.fillStyle = 'white'; 
            ctx.fillRect(0, 0, width, height);
            
            // Header
            ctx.fillStyle = 'black';
            ctx.textAlign = 'center';
            canvasUtils.fitTextSingleLine(ctx, eq.title, width / 2, 80, width - 40, 40, 'bold');
            ctx.fillRect(40, 100, width - 80, 4);
            ctx.textAlign = 'left'; // Reset

            try {
                // We use CodeCogs to generate a massive, crisp PNG of the LaTeX
                const latexUrl = `https://latex.codecogs.com/png.image?\\dpi{200}\\bg_white\\Huge ${encodeURIComponent(eq.formula)}`;
                
                // Fetch it as a blob through the proxy to bypass Canvas Taint rules
                const res = await fetch(`${CORS_PROXY}${encodeURIComponent(latexUrl)}`);
                const blob = await res.blob();
                
                // Convert blob to ImageBitmap so Canvas can draw it
                const bitmap = await createImageBitmap(blob);
                
                // Center the equation image on the screen
                const imgX = (width - bitmap.width) / 2;
                const imgY = (height - bitmap.height) / 2 + 40; // Shift down slightly below header
                
                // Draw it!
                ctx.drawImage(bitmap, imgX, imgY);

            } catch (err) {
                ctx.textAlign = 'center';
                canvasUtils.fitTextSingleLine(ctx, 'Failed to render LaTeX image.', width / 2, height / 2, width - 60, 30);
                ctx.textAlign = 'left';
                console.error(err);
            }
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
        // Load global settings
        document.getElementById('inkyUrlInput').value = config.inkyUrl;
        document.getElementById('intervalInput').value = config.interval;
        // Find active plugin to update the modal title/subtitle
        const activePlugin = Plugins.find(p => p.id === config.activePluginId);
        const pluginSettingsHeader = document.getElementById('activePluginNameLabel');
        if (pluginSettingsHeader) {
            pluginSettingsHeader.innerText = activePlugin ? activePlugin.name : 'Global';
        }
        // Build the specific inputs
        buildApiKeyInputs();
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
    // Group plugins by their theme
    const groupedPlugins = Plugins.reduce((acc, plugin) => {
        const theme = plugin.theme || 'Uncategorized';
        if (!acc[theme]) acc[theme] = [];
        acc[theme].push(plugin);
        return acc;
    }, {});
    // Iterate through the grouped categories
    for (const [theme, pluginsInTheme] of Object.entries(groupedPlugins)) {
        // 1. Create the Category Header
        const header = document.createElement('div');
        header.className = 'text-xs font-bold text-gray-500 uppercase tracking-widest mt-5 mb-2 first:mt-0 px-1 border-b border-gray-200 pb-1';
        header.innerText = theme;
        list.appendChild(header);
        // 2. Render the Plugins under this category
        pluginsInTheme.forEach(plugin => {
            const div = document.createElement('div');
            const isActive = plugin.id === config.activePluginId;
            // Apply distinct styling if active
            div.className = `p-3 mb-2 border rounded cursor-pointer transition duration-150 ${
                isActive 
                ? 'bg-black text-white border-black shadow-md' 
                : 'hover:bg-gray-50 bg-white border-gray-200'
            }`;
            div.innerHTML = `
                <div class="font-bold flex justify-between items-center">
                    <span>${plugin.name}</span>
                    ${isActive ? '<span class="h-2 w-2 bg-green-400 rounded-full animate-pulse"></span>' : ''}
                </div>
                <div class="text-xs mt-1 leading-relaxed ${isActive ? 'text-gray-300' : 'text-gray-500'}">
                    ${plugin.description}
                </div>
                <div class="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono ${
                    isActive ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'
                }">
                    Min: ${plugin.minInterval || 60}s
                </div>
            `;
            div.onclick = () => {
                config.activePluginId = plugin.id;
                localStorage.setItem('inkyActivePlugin', plugin.id);
                renderPluginList(); 
                runLoop(); // Immediately trigger the new plugin and reset its specific timer
            };
            list.appendChild(div);
        });
    }
}

function buildApiKeyInputs() {
    const container = document.getElementById('apiKeysContainer');
    container.innerHTML = '';
    
    // Find the currently selected plugin
    const activePlugin = Plugins.find(p => p.id === config.activePluginId);
    
    // If no keys are required, show a friendly message
    if (!activePlugin || !activePlugin.requiredKeys || activePlugin.requiredKeys.length === 0) {
        container.innerHTML = `
            <div class="text-sm text-gray-500 italic p-3 bg-gray-50 border rounded text-center">
                No API keys or extra settings required for <b>${activePlugin ? activePlugin.name : 'this plugin'}</b>.
            </div>
        `;
        return;
    }
    
    // Create inputs ONLY for the active plugin
    activePlugin.requiredKeys.forEach(keyDef => {
        const wrapper = document.createElement('div');
        const savedValue = config.apiKeys[keyDef.id] || '';
        
        let inputHtml = '';
        
        if (keyDef.type === 'password') {
            const placeholder = savedValue ? '(unchanged)' : 'Enter API Key';
            inputHtml = `<input type="password" data-key="${keyDef.id}" class="apikey-input w-full border p-2 rounded text-sm focus:ring-black focus:border-black" placeholder="${placeholder}">`;
            
        } else if (keyDef.type === 'number') {
            inputHtml = `<input type="number" data-key="${keyDef.id}" class="apikey-input w-full border p-2 rounded text-sm focus:ring-black focus:border-black" placeholder="${keyDef.placeholder || ''}" value="${savedValue}">`;
            
        } else { 
            inputHtml = `<input type="text" data-key="${keyDef.id}" class="apikey-input w-full border p-2 rounded text-sm focus:ring-black focus:border-black" placeholder="${keyDef.placeholder || ''}" value="${savedValue}">`;
        }
        
        wrapper.innerHTML = `
            <label class="block text-sm font-medium mb-1 mt-3 text-gray-700">${keyDef.label || keyDef.id}</label>
            ${inputHtml}
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
    
    setStatus('Applying new settings...');
    lastFrameData = null;
    console.log('[Settings] Saved. Forcing immediate update loop...');
    // Reset timer with new interval
    runLoop();
}

async function forceUpdate() {
    await renderActivePlugin();
    await pushToInky();
}

function runLoop() {
    // Clear the existing timer if it exists
    if (renderTimer) clearTimeout(renderTimer); 
    // Run the update, and ONLY start the next countdown when this one finishes
    forceUpdate().finally(() => {
        const plugin = Plugins.find(p => p.id === config.activePluginId) || Plugins[0];
        const safeMin = plugin.minInterval || 2; 
        const intervalToUse = Math.max(config.interval, safeMin);
        console.log(`[Rate Limit] Next update scheduled in ${intervalToUse} seconds.`);
        renderTimer = setTimeout(runLoop, intervalToUse * 1000);
    });
}

async function renderActivePlugin() {
    setStatus('Rendering...');
    const plugin = Plugins.find(p => p.id === config.activePluginId) || Plugins[0];
    
    // Check missing keys using the new object structure (keyDef.id)
    const missingKeys = plugin.requiredKeys.filter(keyDef => {
        const val = config.apiKeys[keyDef.id];
        return val === undefined || val.trim() === '';
    });

    if (missingKeys.length > 0) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, 800, 480);
        ctx.fillStyle = 'black';
        
        // Extract the user-friendly labels for the error message
        const missingNames = missingKeys.map(k => k.label || k.id).join(', ');
        
        ctx.font = 'bold 35px Arial';
        ctx.fillText('Missing Configuration:', 50, 100);
        
        ctx.font = '28px Arial';
        // Using the wrapText utility we built earlier so long lists don't run off-screen
        canvasUtils.wrapText(ctx, missingNames, 50, 160, 700, 40);
        
        ctx.font = 'italic 25px Arial';
        ctx.fillText('Please click "Settings" to configure this plugin.', 50, 300);
        
        setStatus('Key Missing');
        return;
    }

    try {
        await plugin.render(ctx, 800, 480, config.apiKeys);
        setStatus('Ready to Push');
    } catch (err) {
        console.error(`Error rendering plugin ${plugin.id}:`, err);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, 800, 480);
        ctx.fillStyle = 'black';
        ctx.font = '30px Arial';
        ctx.fillText('Plugin Render Error. Check console.', 50, 100);
        setStatus('Render Error');
    }
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