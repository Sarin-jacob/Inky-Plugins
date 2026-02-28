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
let searchQuery = '';
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
        name: 'Hello Inky',
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
        name: 'Hacker News Top',
        theme: 'Tech & Dev',
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
    },
    {
        id: 'pomodoro_timer',
        theme: 'Productivity',
        name: 'Pomodoro Tracker',
        description: 'Deep work timer. Auto-switches between Work and Break.',
        minInterval: 60, // Updates once a minute
        requiredKeys: [
            { id: 'work_mins', type: 'number', label: 'Work Focus (Minutes)', placeholder: '25' },
            { id: 'break_mins', type: 'number', label: 'Break (Minutes)', placeholder: '5' }
        ],
        // Internal state to track the timer across refresh cycles
        state: { endTime: 0, mode: 'Idle', totalMins: 0 },
        render: async function(ctx, width, height, apiKeys) {
            const workMins = parseInt(apiKeys['work_mins']) || 25;
            const breakMins = parseInt(apiKeys['break_mins']) || 5;
            const now = Date.now();

            // Initialize or switch modes if time is up
            if (this.state.mode === 'Idle' || now >= this.state.endTime) {
                this.state.mode = this.state.mode === 'Work' ? 'Break' : 'Work';
                this.state.totalMins = this.state.mode === 'Work' ? workMins : breakMins;
                this.state.endTime = now + (this.state.totalMins * 60 * 1000);
            }

            const remainingMs = this.state.endTime - now;
            const remainingMins = Math.ceil(remainingMs / 60000);
            
            // Calculate progress for the bar (0.0 to 1.0)
            const progress = 1 - (remainingMins / this.state.totalMins);

            // Draw Background
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);

            // Draw Mode Header
            ctx.fillStyle = 'black';
            ctx.textAlign = 'center';
            canvasUtils.fitTextSingleLine(ctx, `${this.state.mode} Session`, width / 2, 100, width - 40, 60, 'bold');
            
            // Draw Giant Remaining Minutes
            canvasUtils.fitTextSingleLine(ctx, `${remainingMins} MIN`, width / 2, 280, width - 40, 160, 'bold');
            
            // Reset text align
            ctx.textAlign = 'left';

            // Draw Progress Bar outline
            const barX = 50;
            const barY = 380;
            const barW = width - 100;
            const barH = 40;
            
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'black';
            ctx.strokeRect(barX, barY, barW, barH);
            
            // Fill Progress Bar
            ctx.fillStyle = 'black';
            ctx.fillRect(barX + 4, barY + 4, (barW - 8) * progress, barH - 8);
        }
    },
    {
        id: 'desk_clock',
        theme: 'Daily Utility',
        name: 'Minimalist Desk Clock',
        description: 'A massive, easy-to-read digital clock and date.',
        minInterval: 60, // Updates every minute
        requiredKeys: [],
        render: async (ctx, width, height, apiKeys) => {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            
            const now = new Date();
            
            // Format Time (e.g., "10:15 AM")
            const timeString = now.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit', 
                hour12: true 
            });
            
            // Format Date (e.g., "Saturday, February 28")
            const dateString = now.toLocaleDateString('en-US', { 
                weekday: 'long', 
                month: 'long', 
                day: 'numeric' 
            });

            ctx.fillStyle = 'black';
            ctx.textAlign = 'center';
            
            // Giant Time
            canvasUtils.fitTextSingleLine(ctx, timeString, width / 2, 240, width - 40, 180, 'bold');
            
            // Subtitle Date
            ctx.fillStyle = '#333';
            canvasUtils.fitTextSingleLine(ctx, dateString, width / 2, 340, width - 40, 50, 'normal');
            
            ctx.textAlign = 'left'; // Reset
        }
    },
    {
        id: 'ml_glossary',
        theme: 'AI & Research',
        name: 'ML Glossary',
        description: 'Cycles through Machine Learning terminology.',
        minInterval: 3600, // Update once an hour
        requiredKeys: [],
        render: async (ctx, width, height, apiKeys) => {
            const terms = [
                { term: "Overfitting", def: "When a model learns the training data too well, including the noise, resulting in poor performance on unseen data." },
                { term: "Gradient Descent", def: "An optimization algorithm used to minimize the loss function by iteratively moving in the direction of steepest descent." },
                { term: "Epoch", def: "One complete pass of the training dataset through the machine learning algorithm." },
                { term: "Zero-Shot Learning", def: "A model's ability to recognize or categorize objects/concepts it has never seen during training, usually using semantic representations." },
                { term: "Hyperparameter", def: "A parameter whose value is set before the learning process begins, like learning rate or batch size (unlike weights which are derived)." }
            ];
            
            const item = terms[Math.floor(Math.random() * terms.length)];
            
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            
            // Header
            ctx.fillStyle = 'black';
            canvasUtils.fitTextSingleLine(ctx, 'ML Term of the Day', 40, 60, width - 80, 35, 'bold');
            ctx.fillRect(40, 80, width - 80, 4);
            
            // The Term
            canvasUtils.fitTextSingleLine(ctx, item.term, 40, 180, width - 80, 70, 'bold');
            
            // The Definition (using the multi-line utility so it wraps nicely!)
            ctx.fillStyle = '#333';
            canvasUtils.fitTextMultiLine(ctx, item.def, 40, 240, width - 80, 200, 40, 'normal');
        }
    },
    {
        id: 'todoist_tasks',
        theme: 'Productivity',
        name: 'Todoist Active Tasks',
        description: 'Pulls your top tasks directly from Todoist.',
        minInterval: 300, // 5 minutes
        requiredKeys: [
            { id: 'todoist_token', type: 'password', label: 'Todoist API Token (Bearer)' }
        ],
        render: async (ctx, width, height, apiKeys) => {
            const token = apiKeys['todoist_token'];
            
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = 'black';
            
            canvasUtils.fitTextSingleLine(ctx, 'Today\'s Focus', 30, 60, width - 60, 40, 'bold');
            ctx.fillRect(30, 80, width - 60, 4);

            try {
                // Todoist API wrapped in our proxy
                const url = 'https://api.todoist.com/api/v1/tasks?filter=today|overdue';
                const res = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (!res.ok) throw new Error('Failed to fetch tasks');
                const tasks = await res.json();

                if (tasks.length === 0) {
                    canvasUtils.fitTextSingleLine(ctx, 'Inbox Zero! No tasks for today.', 30, 150, width - 60, 35, 'italic');
                    return;
                }

                // Show up to 5 tasks to ensure they fit nicely
                const displayTasks = tasks.slice(0, 5);
                const ySpacing = Math.min(75, (height - 120) / displayTasks.length);
                let yPos = 130;

                displayTasks.forEach((task, index) => {
                    // Draw a little checkbox square
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = 'black';
                    ctx.strokeRect(30, yPos - 25, 25, 25);
                    
                    // High priority tasks get a bold font
                    const isHighPriority = task.priority > 2;
                    const weight = isHighPriority ? 'bold' : 'normal';
                    
                    ctx.fillStyle = 'black';
                    canvasUtils.fitTextSingleLine(ctx, task.content, 70, yPos, width - 100, 28, weight);
                    
                    yPos += ySpacing;
                });

            } catch (err) {
                canvasUtils.fitTextSingleLine(ctx, 'Error fetching Todoist. Check your API Token.', 30, 150, width - 60, 30);
                console.error(err);
            }
        }
    },
    {
        id: 'crypto_ticker',
        theme: 'Daily Utility',
        name: 'Crypto Price Ticker',
        description: 'Live prices and 24h change for any crypto.',
        minInterval: 120, // 2 minutes
        requiredKeys: [
            { id: 'coin_id', type: 'text', label: 'Coin ID', placeholder: 'e.g., bitcoin, ethereum, solana' }
        ],
        render: async (ctx, width, height, apiKeys) => {
            const coinId = (apiKeys['coin_id'] || 'bitcoin').toLowerCase();
            
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            
            try {
                const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`;
                const res = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`);
                const data = await res.json();
                
                if (!data[coinId]) throw new Error('Coin not found');

                const price = data[coinId].usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
                const change = data[coinId].usd_24h_change;
                const changeStr = `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;

                // Draw Coin Name
                ctx.fillStyle = 'black';
                ctx.textAlign = 'center';
                canvasUtils.fitTextSingleLine(ctx, coinId.toUpperCase(), width / 2, 120, width - 40, 60, 'bold');
                
                // Draw Giant Price
                canvasUtils.fitTextSingleLine(ctx, price, width / 2, 260, width - 40, 120, 'bold');
                
                // Draw 24h Change below it
                // If it's positive, we use an upward arrow. If negative, downward.
                const arrow = change > 0 ? '▲' : '▼';
                
                // On a B&W e-ink display, we just use text styling instead of green/red colors
                ctx.fillStyle = '#333';
                canvasUtils.fitTextSingleLine(ctx, `24h Change: ${arrow} ${changeStr}`, width / 2, 360, width - 40, 40, 'normal');
                
                ctx.textAlign = 'left'; // Reset

            } catch (err) {
                ctx.fillStyle = 'black';
                ctx.textAlign = 'left';
                canvasUtils.fitTextSingleLine(ctx, `Error: Could not fetch data for '${coinId}'`, 30, 150, width - 60, 30);
                console.error(err);
            }
        }
    },
    {
        id: 'rss_reader',
        theme: 'News & Feeds',
        name: 'Universal RSS Reader',
        description: 'Pulls the latest posts from any RSS/Atom feed.',
        minInterval: 3600, // 1 hour
        requiredKeys: [
            { id: 'rss_url', type: 'text', label: 'RSS Feed URL', placeholder: 'https://bair.berkeley.edu/blog/feed.xml' },
            { id: 'feed_title', type: 'text', label: 'Custom Title', placeholder: 'Berkeley AI Research' }
        ],
        render: async (ctx, width, height, apiKeys) => {
            const feedUrl = apiKeys['rss_url'] || 'https://bair.berkeley.edu/blog/feed.xml';
            const title = apiKeys['feed_title'] || 'Latest Posts';
            
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = 'black';
            
            canvasUtils.fitTextSingleLine(ctx, title, 30, 60, width - 60, 40, 'bold');
            ctx.fillRect(30, 80, width - 60, 4);

            try {
                const res = await fetch(`${CORS_PROXY}${encodeURIComponent(feedUrl)}`);
                const text = await res.text();
                
                // Parse the XML
                const parser = new DOMParser();
                const xml = parser.parseFromString(text, "text/xml");
                
                // Handle both RSS (<item>) and Atom (<entry>) formats
                const items = Array.from(xml.querySelectorAll('item, entry')).slice(0, 4);
                
                if (items.length === 0) throw new Error('No items found in feed.');

                let yPos = 140;
                const availableHeight = height - 120;
                const ySpacing = Math.min(90, availableHeight / items.length);

                items.forEach((item, index) => {
                    // Extract data (handling differences between RSS and Atom)
                    let itemTitle = (item.querySelector('title')?.textContent || 'Untitled').trim();
                    let dateStr = item.querySelector('pubDate, published, updated')?.textContent;
                    let date = dateStr ? new Date(dateStr).toLocaleDateString() : '';
                    
                    // Draw Bullet
                    ctx.beginPath();
                    ctx.arc(40, yPos - 10, 5, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // Draw Title
                    const titleSize = Math.min(28, ySpacing * 0.45);
                    canvasUtils.fitTextSingleLine(ctx, itemTitle, 60, yPos, width - 90, titleSize, 'bold');
                    
                    // Draw Date
                    if (date) {
                        ctx.fillStyle = '#555'; // Dithers nicely
                        const subSize = Math.min(20, ySpacing * 0.35);
                        canvasUtils.fitTextSingleLine(ctx, `Published: ${date}`, 60, yPos + (ySpacing * 0.4), width - 90, subSize, 'italic');
                        ctx.fillStyle = 'black'; // Reset for next bullet
                    }
                    
                    yPos += ySpacing;
                });

            } catch (err) {
                canvasUtils.fitTextSingleLine(ctx, 'Error parsing RSS Feed. Is the URL correct?', 30, 150, width - 60, 30);
                console.error(err);
            }
        }
    },
    {
        id: 'github_profile',
        theme: 'Tech & Dev',
        name: 'GitHub Hacker Card',
        description: 'Profile stats and the 52-week contribution map.',
        minInterval: 3600, // 1 hour
        requiredKeys: [
            { id: 'github_username', type: 'text', label: 'GitHub Username', placeholder: 'Sarin-jacob' }
        ],
        render: async (ctx, width, height, apiKeys) => {
            const username = apiKeys['github_username'] || 'Sarin-jacob';
            
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            
            try {
                // 1. Fetch User Stats
                const userRes = await fetch(`https://api.github.com/users/${username}`);
                if (!userRes.ok) throw new Error('User not found');
                const user = await userRes.json();

                // 2. Fetch Contributions HTML via Proxy (GitHub returns the graph as a DOM fragment)
                const contribUrl = `https://github.com/users/${username}/contributions`;
                const contribRes = await fetch(`${CORS_PROXY}${encodeURIComponent(contribUrl)}`);
                const html = await contribRes.text();
                
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
                // GitHub uses data-level="0" to "4" to show commit density. 
                // We grab all of them in order (they are returned week by week, Sun-Sat).
                const cells = Array.from(doc.querySelectorAll('[data-level]'));
                const levels = cells.map(c => parseInt(c.getAttribute('data-level')) || 0);

                // --- Drawing the Layout ---

                // Header Background
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, width, 140);
                
                // Name & Handle
                ctx.fillStyle = 'white';
                canvasUtils.fitTextSingleLine(ctx, (user.name || user.login).toUpperCase(), 40, 60, width - 80, 50, 'bold');
                
                ctx.fillStyle = '#ccc';
                canvasUtils.fitTextSingleLine(ctx, `@${user.login}  |  Repos: ${user.public_repos}  |  Followers: ${user.followers}`, 40, 110, width - 80, 24, 'normal', 'monospace');
                
                // Bio
                ctx.fillStyle = 'black';
                if (user.bio) {
                    canvasUtils.fitTextMultiLine(ctx, user.bio, 40, 170, width - 80, 80, 24, 'italic');
                }

                // --- Drawing the Contribution Graph ---
                const boxSize = 10;
                const gap = 4;
                const startX = 60;
                const startY = 320;
                
                ctx.fillStyle = 'black';
                canvasUtils.fitTextSingleLine(ctx, 'Last 365 Days of Code', startX - 20, startY - 20, width - 80, 24, 'bold');
                
                // Draw Days of week labels (Mon, Wed, Fri)
                ctx.font = '14px monospace';
                ctx.fillText('Mon', startX - 40, startY + (boxSize+gap)*1 + 10);
                ctx.fillText('Wed', startX - 40, startY + (boxSize+gap)*3 + 10);
                ctx.fillText('Fri', startX - 40, startY + (boxSize+gap)*5 + 10);

                // Draw the Grid
                let col = 0;
                let row = 0;
                
                for (let i = 0; i < levels.length; i++) {
                    const level = levels[i];
                    const x = startX + (col * (boxSize + gap));
                    const y = startY + (row * (boxSize + gap));
                    
                    ctx.fillStyle = 'black';
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 1;
                    
                    // B&W "Grass" Logic
                    if (level === 0) {
                        ctx.strokeRect(x, y, boxSize, boxSize); // Empty
                    } else if (level === 1 || level === 2) {
                        ctx.strokeRect(x, y, boxSize, boxSize); 
                        ctx.fillRect(x + 2, y + 2, boxSize - 4, boxSize - 4); // Medium dot
                    } else {
                        ctx.fillRect(x, y, boxSize, boxSize); // Solid block for heavy days
                    }

                    row++;
                    // GitHub grid is 7 days tall (Sunday to Saturday)
                    if (row === 7) {
                        row = 0;
                        col++;
                    }
                }

            } catch (err) {
                ctx.fillStyle = 'black';
                canvasUtils.fitTextSingleLine(ctx, `Error fetching profile or graph for @${username}`, 30, 150, width - 60, 30);
                console.error(err);
            }
        }
    },
];

// --- Core Functions ---

function init() {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeIcon = document.getElementById('themeIcon');
    
    // Setup initial theme and icon
    const isDark = localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
        document.documentElement.classList.add('dark');
        themeIcon.setAttribute('data-lucide', 'sun'); // Show sun if we are in dark mode
    } else {
        document.documentElement.classList.remove('dark');
        themeIcon.setAttribute('data-lucide', 'moon');
    }

    themeToggleBtn.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        const isNowDark = document.documentElement.classList.contains('dark');
        localStorage.theme = isNowDark ? 'dark' : 'light';
        
        // Swap the icon
        themeIcon.setAttribute('data-lucide', isNowDark ? 'sun' : 'moon');
        lucide.createIcons(); // Force re-render of the specific icon
    });

    // Search Filtering Logic
    document.getElementById('searchInput').addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderPluginList();
    });
    renderPluginList();
    buildApiKeyInputs();
    runLoop();
    lucide.createIcons();
    
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
    
    // 1. FILTER the plugins based on the search query
    const filteredPlugins = Plugins.filter(p => 
        p.name.toLowerCase().includes(searchQuery) || 
        p.description.toLowerCase().includes(searchQuery) ||
        (p.theme && p.theme.toLowerCase().includes(searchQuery))
    );

    if (filteredPlugins.length === 0) {
        list.innerHTML = `<div class="text-sm text-gray-500 dark:text-gray-400 text-center mt-4">No plugins found matching "${searchQuery}"</div>`;
        return;
    }

    // 2. GROUP the filtered plugins by their theme
    const groupedPlugins = filteredPlugins.reduce((acc, plugin) => {
        const theme = plugin.theme || 'Uncategorized';
        if (!acc[theme]) acc[theme] = [];
        acc[theme].push(plugin);
        return acc;
    }, {});

    // 3. RENDER the grouped plugins
    for (const [theme, pluginsInTheme] of Object.entries(groupedPlugins)) {
        
        const header = document.createElement('div');
        header.className = 'text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-5 mb-2 first:mt-0 px-1 border-b border-gray-200 dark:border-gray-700 pb-1';
        header.innerText = theme;
        list.appendChild(header);

        pluginsInTheme.forEach(plugin => {
            const div = document.createElement('div');
            const isActive = plugin.id === config.activePluginId;
            
            // Added Dark Mode specific styles
            div.className = `p-3 mb-2 border rounded cursor-pointer transition duration-150 ${
                isActive 
                ? 'bg-black text-white dark:bg-gray-100 dark:text-black border-black dark:border-gray-100 shadow-md' 
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100'
            }`;
            
            div.innerHTML = `
                <div class="font-bold flex justify-between items-center">
                    <span>${plugin.name}</span>
                    ${isActive ? '<span class="h-2 w-2 bg-green-400 dark:bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)]"></span>' : ''}
                </div>
                <div class="text-xs mt-1 leading-relaxed ${isActive ? 'text-gray-300 dark:text-gray-700' : 'text-gray-500 dark:text-gray-400'}">
                    ${plugin.description}
                </div>
                <div class="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono ${
                    isActive ? 'bg-gray-800 dark:bg-gray-300 text-gray-300 dark:text-gray-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300'
                }">
                    <i data-lucide="clock" class="w-3 h-3 mr-1"></i>  ${plugin.minInterval || 3}s
                </div>
            `;
            
            div.onclick = () => {
                config.activePluginId = plugin.id;
                localStorage.setItem('inkyActivePlugin', plugin.id);
                renderPluginList(); 
                runLoop(); 
            };
            
            list.appendChild(div);
        });
    }
    lucide.createIcons();
}

function buildApiKeyInputs() {
    const container = document.getElementById('apiKeysContainer');
    container.innerHTML = '';
    
    // Find the currently selected plugin
    const activePlugin = Plugins.find(p => p.id === config.activePluginId);
    
    // If no keys are required, show a friendly message
    if (!activePlugin || !activePlugin.requiredKeys || activePlugin.requiredKeys.length === 0) {
        container.innerHTML = `
            <div class="text-sm text-gray-500 dark:text-gray-50 italic p-3 bg-gray-50 dark:bg-gray-500 border rounded text-center">
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
            inputHtml = `<input type="password" data-key="${keyDef.id}" class="apikey-input dark:text-gray-50 dark:bg-gray-800 w-full border p-2 rounded text-sm focus:ring-black focus:border-black" placeholder="${placeholder}">`;
            
        } else if (keyDef.type === 'number') {
            inputHtml = `<input type="number" data-key="${keyDef.id}" class="apikey-input dark:text-gray-50 dark:bg-gray-800 w-full border p-2 rounded text-sm focus:ring-black focus:border-black" placeholder="${keyDef.placeholder || ''}" value="${savedValue}">`;
            
        } else { 
            inputHtml = `<input type="text" data-key="${keyDef.id}" class="apikey-input dark:text-gray-50 dark:bg-gray-800 w-full border p-2 rounded text-sm focus:ring-black focus:border-black" placeholder="${keyDef.placeholder || ''}" value="${savedValue}">`;
        }
        
        wrapper.innerHTML = `
            <label class="block text-sm font-medium mb-1 mt-3 dark:text-gray-50 text-gray-700">${keyDef.label || keyDef.id}</label>
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