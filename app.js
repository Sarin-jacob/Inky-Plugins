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
            { id: 'openweather_key', type: 'password', label: 'OpenWeather API Key', required:true },
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
            { id: 'github_repo', type: 'text', label: 'Target Repo (user/repo)', placeholder: 'e.g., Sarin-jacob/Inky', required: true },
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
                // Naruto Uzumaki
                { text: "Hard work is worthless for those that don't believe in themselves.", author: "Naruto Uzumaki" },
                { text: "If you don't like your destiny, don't accept it. Instead have the courage to change it.", author: "Naruto Uzumaki" },
                { text: "I'm not gonna run away, I never go back on my word! That's my nindo: my ninja way!", author: "Naruto Uzumaki" },
                { text: "Failing doesn't give you a reason to give up, as long as you believe.", author: "Naruto Uzumaki" },
                { text: "Once you question your own belief, it's over.", author: "Naruto Uzumaki" },
                { text: "While you're alive, you need a reason for your existence. Being unable to find one is the same as being dead.", author: "Naruto Uzumaki" },

                // Itachi Uchiha
                { text: "People live their lives bound by what they accept as correct and true. That is how they define 'reality'.", author: "Itachi Uchiha" },
                { text: "It is not the face that makes someone a monster, it's the choices they make with their lives.", author: "Itachi Uchiha" },
                { text: "Those who forgive themselves, and are able to accept their true nature... They are the strong ones!", author: "Itachi Uchiha" },
                { text: "Even the strongest of opponents always has a weakness.", author: "Itachi Uchiha" },
                { text: "Knowledge and awareness are vague, and perhaps better called illusions. Everyone lives within their own subjective interpretation.", author: "Itachi Uchiha" },

                // Pain / Nagato
                { text: "Sometimes you must hurt in order to know, fall in order to grow, lose in order to gain because life's greatest lessons are learned through pain.", author: "Pain" },
                { text: "Love is the reason why there is pain. When we lose someone precious to us, hate is born.", author: "Pain" },
                { text: "Those who do not understand true pain can never understand true peace.", author: "Pain" },
                { text: "Religion, ideology, resources, land, spite, love or just because... No matter how pathetic the reason, it's enough to start a war.", author: "Pain" },

                // Madara Uchiha
                { text: "Wake up to reality! Nothing ever goes as planned in this accursed world.", author: "Madara Uchiha" },
                { text: "In this world, wherever there is light - there are also shadows.", author: "Madara Uchiha" },
                { text: "As long as the concept of winners exists, there must also be losers.", author: "Madara Uchiha" },
                { text: "Man seeks peace, yet at the same time yearning for war... Those are the two realms belonging solely to man.", author: "Madara Uchiha" },

                // Kakashi Hatake
                { text: "Those who break the rules are scum, but those who abandon their friends are worse than scum.", author: "Kakashi Hatake" },
                { text: "In society, those who don't have many abilities, tend to complain more.", author: "Kakashi Hatake" },
                { text: "The next generation will always surpass the previous one. It's one of the never-ending cycles in life.", author: "Kakashi Hatake" },
                { text: "To know what is right and choose to ignore it is the act of a coward.", author: "Kakashi Hatake" },

                // Jiraiya
                { text: "Knowing what it feels to be in pain, is exactly why we try to be kind to others.", author: "Jiraiya" },
                { text: "A person grows up when he's able to overcome hardships. Protection is important, but there are some things that a person must learn on his own.", author: "Jiraiya" },
                { text: "The true measure of a shinobi is not how he lives but how he dies.", author: "Jiraiya" },

                // Gaara
                { text: "In order to escape a road of despair, one must pave a new one.", author: "Gaara" },
                { text: "Just because someone is important to you, it doesn't necessarily mean that, that person is good.", author: "Gaara" },
                { text: "We have walked through the darkness of this world, that's why we are able to see even a sliver of light.", author: "Gaara" },

                // Rock Lee & Might Guy
                { text: "A drop of sweat from hard work is the most beautiful jewel.", author: "Rock Lee" },
                { text: "A genius, huh? What does that mean? 'Genius'? So I was not born with a whole lot of natural talent... but I work hard and I never give up!", author: "Rock Lee" },
                { text: "You're right, all efforts are pointless... if you don't believe in yourself.", author: "Might Guy" },

                // Others
                { text: "When people are protecting something truly special to them, they truly can become as strong as they can be.", author: "Haku" },
                { text: "It's human nature not to realize the true value of something, unless they lose it.", author: "Orochimaru" },
                { text: "People become stronger because they have memories they can't forget.", author: "Tsunade" },
                { text: "Fear. That is what we live with. And we live it everyday. Only in death are we free of it.", author: "Neji Hyuga" },
                { text: "A smile is the easiest way out of a difficult situation.", author: "Sakura Haruno" },
                { text: "Laziness is the mother of all bad habits. But ultimately she is a mother and we should respect her.", author: "Shikamaru Nara" },
                { text: "I have long since closed my eyes... My only goal is in the darkness.", author: "Sasuke Uchiha" },
                { text: "There's no such thing as a life without regrets.", author: "Minato Namikaze" }
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
        // minInterval: 5, // Faster updates look cool for automata
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
            { id: 'cricketdata_key', type: 'password', label: 'CricketData.org API Key', required: true }
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
                // Foundational Math & Statistics
                { title: "Bayes' Theorem", formula: "P(A|B) = \\frac{P(B|A)P(A)}{P(B)}" },
                { title: "Normal Distribution (Gaussian)", formula: "f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} \\exp\\left(-\\frac{(x-\\mu)^2}{2\\sigma^2}\\right)" },
                { title: "Covariance Matrix", formula: "\\Sigma = \\frac{1}{n-1} \\sum_{i=1}^n (x_i - \\bar{x})(x_i - \\bar{x})^T" },
                { title: "Cosine Similarity", formula: "\\text{sim}(A, B) = \\frac{A \\cdot B}{\\|A\\| \\|B\\|} = \\frac{\\sum A_i B_i}{\\sqrt{\\sum A_i^2}\\sqrt{\\sum B_i^2}}" },
                { title: "Pearson Correlation", formula: "r = \\frac{\\sum (x_i - \\bar{x})(y_i - \\bar{y})}{\\sqrt{\\sum (x_i - \\bar{x})^2 \\sum (y_i - \\bar{y})^2}}" },
                { title: "Markov Property", formula: "P(X_{n+1} = x | X_1, X_2, \\dots, X_n) = P(X_{n+1} = x | X_n)" },

                // Loss Functions
                { title: "Mean Squared Error (MSE)", formula: "\\text{MSE} = \\frac{1}{n}\\sum_{i=1}^n(Y_i - \\hat{Y}_i)^2" },
                { title: "Cross-Entropy Loss", formula: "L = -\\sum_{c=1}^M y_{c} \\log(p_{c})" },
                { title: "Binary Cross-Entropy (Log Loss)", formula: "L = -\\frac{1}{N} \\sum_{i=1}^N \\left[ y_i \\log(\\hat{y}_i) + (1 - y_i) \\log(1 - \\hat{y}_i) \\right]" },
                { title: "Hinge Loss (SVM)", formula: "L = \\max(0, 1 - y \\cdot \\hat{y})" },
                { title: "Kullback-Leibler Divergence", formula: "D_{KL}(P||Q) = \\sum_{x} P(x) \\log\\left(\\frac{P(x)}{Q(x)}\right)" },
                { title: "Huber Loss", formula: "L_\\delta = \\begin{cases} \\frac{1}{2}(y - \\hat{y})^2 & \\text{for } |y - \\hat{y}| \\le \\delta \\\\ \\delta |y - \\hat{y}| - \\frac{1}{2}\\delta^2 & \\text{otherwise} \\end{cases}" },

                // Activations
                { title: "Sigmoid Activation", formula: "\\sigma(x) = \\frac{1}{1 + e^{-x}}" },
                { title: "ReLU Activation", formula: "\\text{ReLU}(x) = \\max(0, x)" },
                { title: "Softmax Function", formula: "\\sigma(\\mathbf{z})_i = \\frac{e^{z_i}}{\\sum_{j=1}^K e^{z_j}}" },
                { title: "Hyperbolic Tangent (Tanh)", formula: "\\tanh(x) = \\frac{e^x - e^{-x}}{e^x + e^{-x}}" },
                { title: "GELU Activation", formula: "\\text{GELU}(x) = x \\cdot \\Phi(x) \\approx 0.5x \\left(1 + \\tanh\\left[\\sqrt{2/\\pi} (x + 0.044715 x^3)\\right]\\right)" },
                { title: "Swish Activation", formula: "\\text{Swish}(x) = x \\cdot \\sigma(\\beta x)" },

                // Optimization & Learning
                { title: "Gradient Descent Update", formula: "\\theta_{t+1} = \\theta_t - \\eta \\nabla_{\\theta} J(\\theta_t)" },
                { title: "Backpropagation (Chain Rule)", formula: "\\frac{\\partial E}{\\partial w_{ij}} = \\frac{\\partial E}{\\partial o_j} \\frac{\\partial o_j}{\\partial net_j} \\frac{\\partial net_j}{\\partial w_{ij}}" },
                { title: "SGD with Momentum", formula: "v_t = \\gamma v_{t-1} + \\eta \\nabla_{\\theta} J(\\theta); \\quad \\theta_{t+1} = \\theta_t - v_t" },
                { title: "Adam Optimizer Update", formula: "\\theta_{t} = \\theta_{t-1} - \\frac{\\alpha \\cdot \\hat{m}_t}{\\sqrt{\\hat{v}_t} + \\epsilon}" },
                { title: "L2 Regularization (Ridge)", formula: "J(\\theta) = \\text{Loss}(\\theta) + \\lambda \\sum_{j=1}^p \\theta_j^2" },

                // Transformers & NLP
                { title: "Scaled Dot-Product Attention", formula: "\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V" },
                { title: "Multi-Head Attention", formula: "\\text{MultiHead}(Q,K,V) = \\text{Concat}(\\text{head}_1, \\dots, \\text{head}_h)W^O" },
                { title: "Positional Encoding (Sine)", formula: "PE_{(pos, 2i)} = \\sin\\left(\\frac{pos}{10000^{2i/d_{\\text{model}}}}\\right)" },
                { title: "Positional Encoding (Cosine)", formula: "PE_{(pos, 2i+1)} = \\cos\\left(\\frac{pos}{10000^{2i/d_{\\text{model}}}}\\right)" },
                { title: "TF-IDF", formula: "\\text{tf-idf}(t, d, D) = \\text{tf}(t, d) \\times \\log\\left(\\frac{N}{|\\{d \\in D : t \\in d\\}|}\\right)" },

                // Generative AI
                { title: "GAN Minimax Objective", formula: "\\min_G \\max_D V(D,G) = \\mathbb{E}_x[\\log D(x)] + \\mathbb{E}_z[\\log(1 - D(G(z)))]" },
                { title: "VAE ELBO (Evidence Lower Bound)", formula: "\\text{ELBO} = \\mathbb{E}_{q_\\phi}[\\log p_\\theta(x|z)] - D_{KL}(q_\\phi(z|x) || p(z))" },
                { title: "Diffusion Forward Process", formula: "q(x_t | x_{t-1}) = \\mathcal{N}(x_t; \\sqrt{1 - \\beta_t} x_{t-1}, \\beta_t I)" },
                { title: "Diffusion Reverse Process", formula: "p_\\theta(x_{t-1} | x_t) = \\mathcal{N}(x_{t-1}; \\mu_\\theta(x_t, t), \\Sigma_\\theta(x_t, t))" },

                // Classic Machine Learning
                { title: "Logistic Regression", formula: "P(Y=1|X) = \\frac{1}{1 + e^{-(\\beta_0 + \\beta_1 X_1 + \\dots + \\beta_k X_k)}}" },
                { title: "K-Means Objective", formula: "J = \\sum_{j=1}^k \\sum_{i=1}^n \\|x_i^{(j)} - c_j\\|^2" },
                { title: "PCA Eigenvalue Problem", formula: "\\Sigma \\mathbf{v} = \\lambda \\mathbf{v}" },
                { title: "Bellman Equation (RL)", formula: "V(s) = \\max_a \\left( R(s,a) + \\gamma \\sum_{s'} P(s'|s,a) V(s') \\right)" },
                { title: "Q-Learning Update", formula: "Q(s,a) \\leftarrow Q(s,a) + \\alpha \\left[ r + \\gamma \\max_{a'} Q(s',a') - Q(s,a) \\right]" },

                // Computer Vision / Matrices
                { title: "2D Convolution", formula: "(I * K)(i, j) = \\sum_m \\sum_n I(i - m, j - n) K(m, n)" },
                { title: "Intersection over Union (IoU)", formula: "\\text{IoU} = \\frac{\\text{Area of Overlap}}{\\text{Area of Union}}" },
                { title: "Frobenius Norm", formula: "\\|A\\|_F = \\sqrt{\\sum_{i=1}^m \\sum_{j=1}^n |a_{ij}|^2}" }
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
                // Dynamic sizing logic based on character length
                const len = eq.formula.length;
                let sizeMod = '\\Huge'; // Short equations (e.g., Sigmoid)
                if (len > 110) sizeMod = '\\small'; 
                else if (len > 80) sizeMod = '\\large'; // Very long (e.g., Binary Cross Entropy)
                else if (len > 40) sizeMod = '\\LARGE'; // Medium-Long
                else if (len > 25) sizeMod = '\\huge'; // Medium
                
                // Keep the DPI high for clarity, but inject the dynamic size modifier
                const latexUrl = `https://latex.codecogs.com/png.image?\\dpi{200}\\bg_white${sizeMod} ${encodeURIComponent(eq.formula)}`;
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
                // Foundational Concepts
                { term: "Overfitting", def: "When a model learns the training data too well, including the noise, resulting in poor performance on unseen data." },
                { term: "Gradient Descent", def: "An optimization algorithm used to minimize the loss function by iteratively moving in the direction of steepest descent." },
                { term: "Epoch", def: "One complete pass of the training dataset through the machine learning algorithm." },
                { term: "Zero-Shot Learning", def: "A model's ability to recognize or categorize objects/concepts it has never seen during training, usually using semantic representations." },
                { term: "Hyperparameter", def: "A parameter whose value is set before the learning process begins, like learning rate or batch size (unlike weights which are derived)." },
                { term: "Bias-Variance Tradeoff", def: "The balance between a model's ability to capture underlying patterns (low bias) and its sensitivity to fluctuations in the training data (low variance)." },
                { term: "Cross-Validation", def: "A resampling procedure used to evaluate machine learning models on a limited data sample, often by splitting data into 'k' folds." },
                { term: "Regularization", def: "Techniques (like L1 or L2) used to penalize complex models to prevent overfitting and improve generalization." },
                { term: "Learning Rate", def: "A hyperparameter that determines the step size at each iteration while moving toward a minimum of a loss function." },
                { term: "Loss Function", def: "A method of evaluating how well your algorithm models your dataset. If predictions deviate too much from actual results, loss function would cough up a very large number." },
                
                // Neural Network Basics
                { term: "Perceptron", def: "The simplest form of a neural network, consisting of a single layer of linear threshold units." },
                { term: "Activation Function", def: "A mathematical equation attached to each neuron in a network that determines whether it should be activated or not (e.g., ReLU, Sigmoid)." },
                { term: "Backpropagation", def: "The primary algorithm for training neural networks, computing the gradient of the loss function with respect to each weight by the chain rule." },
                { term: "Feedforward Network", def: "An artificial neural network wherein connections between the nodes do not form a cycle." },
                { term: "Dropout", def: "A regularization technique where randomly selected neurons are ignored during training to prevent co-adaptation of features." },
                { term: "Batch Normalization", def: "A technique that standardizes the inputs to a layer for each mini-batch, stabilizing the learning process and reducing the number of training epochs." },
                { term: "Stochastic Gradient Descent (SGD)", def: "A variant of gradient descent that updates the model parameters using only a single or a few training examples at a time." },
                { term: "Adam Optimizer", def: "An adaptive learning rate optimization algorithm that computes individual adaptive learning rates for different parameters from estimates of first and second moments of the gradients." },
                { term: "Softmax Function", def: "A function that turns a vector of K real values into a vector of K real values that sum to 1, often used as the output activation in multi-class classification." },
                { term: "Vanishing Gradient", def: "A difficulty in training deep neural networks where the gradient becomes incredibly small, preventing the weights from changing their value." },

                // Vision & Spatial AI
                { term: "Convolutional Neural Network (CNN)", def: "A class of deep neural networks, most commonly applied to analyzing visual imagery through grid-like topology." },
                { term: "Pooling Layer", def: "A layer in a CNN that reduces the spatial dimensions (width and height) of the input volume, lowering computational cost." },
                { term: "Receptive Field", def: "The defined portion of the input space that a particular CNN feature is looking at." },
                { term: "Semantic Segmentation", def: "The process of classifying every pixel in an image to a specific class or object category." },
                { term: "U-Net", def: "A convolutional network architecture designed for fast and precise image segmentation, highly popular in biomedical image processing." },
                { term: "Object Detection", def: "A computer vision task that involves predicting the presence of multiple objects in an image and putting bounding boxes around them." },
                { term: "Voxel", def: "A value on a regular grid in three-dimensional space, essentially the 3D equivalent of a pixel." },
                { term: "Point Cloud", def: "A set of data points in space, usually produced by 3D scanners, representing the external surface of an object or scene." },
                { term: "Marching Cubes", def: "A computer graphics algorithm that extracts a polygonal mesh of an isosurface from a three-dimensional discrete scalar field (like medical DICOM scans)." },
                { term: "Intersection over Union (IoU)", def: "An evaluation metric used to measure the accuracy of an object detector on a particular dataset." },

                // Transformers & NLP
                { term: "Transformer", def: "A deep learning architecture that relies entirely on self-attention mechanisms to draw global dependencies between input and output." },
                { term: "Self-Attention", def: "A mechanism relating different positions of a single sequence in order to compute a representation of the sequence." },
                { term: "Large Language Model (LLM)", def: "A computational model notable for its ability to achieve general-purpose language generation and other NLP tasks, scaled via massive parameters." },
                { term: "Tokenization", def: "The process of breaking down text into smaller units (tokens) such as words, subwords, or characters for processing by a model." },
                { term: "Embeddings", def: "Dense vectors of real numbers representing text or objects in a continuous vector space, capturing semantic meaning." },
                { term: "Fine-Tuning", def: "Taking a pre-trained model and training it further on a smaller, specific dataset to adapt it to a specialized task." },
                { term: "Recurrent Neural Network (RNN)", def: "A class of neural networks where connections between nodes form a directed graph along a temporal sequence." },
                { term: "Long Short-Term Memory (LSTM)", def: "An artificial RNN architecture capable of learning order dependence in sequence prediction problems." },
                { term: "BLEU Score", def: "An algorithm for evaluating the quality of text which has been machine-translated from one natural language to another." },
                { term: "Named Entity Recognition (NER)", def: "An information extraction task that seeks to locate and classify named entities in text into predefined categories (e.g., person, location)." },

                // Generative AI
                { term: "Generative Adversarial Network (GAN)", def: "A class of machine learning frameworks designed by Goodfellow et al. wherein two neural networks contest with each other in a game." },
                { term: "Discriminator", def: "The network in a GAN whose goal is to distinguish between real data and the fake data generated by its adversary." },
                { term: "Generator", def: "The network in a GAN whose goal is to create synthetic data that is indistinguishable from real data to fool the discriminator." },
                { term: "Autoencoder", def: "A type of neural network used to learn efficient data codings in an unsupervised manner, typically for dimensionality reduction." },
                { term: "Variational Autoencoder (VAE)", def: "A generative model that provides a probabilistic manner for describing an observation in latent space." },
                { term: "Diffusion Model", def: "A class of generative models that learn to generate data by reversing a gradual noising process." },
                { term: "Latent Space", def: "A compressed, multidimensional space in which a machine learning model maps complex input data to internal representations." },
                { term: "Prompt Engineering", def: "The process of designing and optimizing input text prompts to elicit desired outputs from large language models." },
                { term: "Hallucination", def: "A phenomenon where an AI model generates false, nonsensical, or ungrounded information presented as fact." },
                { term: "Temperature", def: "A hyperparameter used in generative models to control the randomness of predictions; higher values lead to more diverse outputs." },

                // Data & Engineering
                { term: "Feature Engineering", def: "The process of using domain knowledge to extract features (characteristics, properties, attributes) from raw data." },
                { term: "Dimensionality Reduction", def: "The transformation of data from a high-dimensional space into a low-dimensional space so that the low-dimensional representation retains meaningful properties." },
                { term: "Principal Component Analysis (PCA)", def: "A statistical procedure that uses an orthogonal transformation to convert observations into a set of values of linearly uncorrelated variables." },
                { term: "One-Hot Encoding", def: "A process of converting categorical data variables so they can be provided to machine learning algorithms to improve predictions." },
                { term: "Data Augmentation", def: "A set of techniques used to increase the amount of data by adding slightly modified copies of already existing data or newly created synthetic data." },
                { term: "Imputation", def: "The process of replacing missing data with substituted values." },
                { term: "Normalization", def: "Scaling individual samples to have unit norm, or scaling features to be between 0 and 1." },
                { term: "Standardization", def: "Transforming data to have a mean of zero and a standard deviation of one." },
                { term: "Outlier", def: "An observation that lies an abnormal distance from other values in a random sample from a population." },
                { term: "Ground Truth", def: "Information provided by direct observation or empirical evidence, considered to be the absolute truth for training algorithms." },

                // Learning Paradigms
                { term: "Supervised Learning", def: "A machine learning paradigm where models are trained using labeled data." },
                { term: "Unsupervised Learning", def: "Training models on data that has no historical labels, asking the algorithm to find structures or patterns." },
                { term: "Reinforcement Learning", def: "An area of ML concerned with how intelligent agents ought to take actions in an environment to maximize the notion of cumulative reward." },
                { term: "Semi-Supervised Learning", def: "An approach to ML that combines a small amount of labeled data with a large amount of unlabeled data during training." },
                { term: "Transfer Learning", def: "A research problem in ML that focuses on storing knowledge gained while solving one problem and applying it to a different but related problem." },
                { term: "Active Learning", def: "A special case of ML in which a learning algorithm can interactively query a user to label new data points with the desired outputs." },
                { term: "Federated Learning", def: "A machine learning technique that trains an algorithm across multiple decentralized edge devices holding local data samples, without exchanging them." },
                { term: "Contrastive Learning", def: "A machine learning technique where a model learns to distinguish between similar and dissimilar data points." },
                { term: "Ensemble Learning", def: "A process using multiple learning algorithms to obtain better predictive performance than could be obtained from any of the constituent learning algorithms alone." },
                { term: "Few-Shot Learning", def: "Feeding a learning model with a very small amount of training data, contrary to the normal practice of using a large amount." },

                // Hardware, Deployment & Edge
                { term: "Inference", def: "The process of running data through a trained machine learning model to make a prediction." },
                { term: "Quantization", def: "The process of reducing the precision of the weights, biases, and activations in a neural network to make it faster and smaller." },
                { term: "Model Pruning", def: "A technique to make neural networks smaller and faster by removing weights that contribute little to the model's output." },
                { term: "Edge AI", def: "The deployment of AI applications in devices throughout the physical world (edge computing) rather than strictly in the cloud." },
                { term: "TinyML", def: "A field of study in ML and embedded systems that explores the types of models you can run on small, low-power devices like microcontrollers." },
                { term: "Tensor Processing Unit (TPU)", def: "An AI accelerator application-specific integrated circuit (ASIC) developed by Google specifically for neural network machine learning." },
                { term: "ONNX", def: "Open Neural Network Exchange: An open-source ecosystem that gives AI developers the flexibility to move models between different tools and frameworks." },
                { term: "CUDA", def: "A parallel computing platform and API created by Nvidia, heavily used for training neural networks on GPUs." },
                { term: "Batch Size", def: "The number of training examples utilized in one iteration." },
                { term: "Containerization", def: "Packaging software code with just the operating system libraries and dependencies required to run the code to create a single lightweight executable (e.g., Docker)." },

                // Evaluation Metrics
                { term: "Accuracy", def: "The ratio of correctly predicted observation to the total observations." },
                { term: "Precision", def: "The ratio of correctly predicted positive observations to the total predicted positive observations." },
                { term: "Recall (Sensitivity)", def: "The ratio of correctly predicted positive observations to the all observations in actual class." },
                { term: "F1 Score", def: "The weighted average of Precision and Recall, useful when you have an uneven class distribution." },
                { term: "Confusion Matrix", def: "A table that is often used to describe the performance of a classification model on a set of test data for which the true values are known." },
                { term: "ROC Curve", def: "Receiver Operating Characteristic curve: A graphical plot that illustrates the diagnostic ability of a binary classifier system." },
                { term: "AUC", def: "Area Under the Curve: Represents the degree or measure of separability, telling how much the model is capable of distinguishing between classes." },
                { term: "Mean Squared Error (MSE)", def: "A measure of the average of the squares of the errors—that is, the average squared difference between the estimated values and the actual value." },
                { term: "Mean Absolute Error (MAE)", def: "A measure of errors between paired observations expressing the same phenomenon." },
                { term: "R-Squared", def: "A statistical measure that represents the proportion of the variance for a dependent variable that's explained by an independent variable." },

                // Advanced / Math Specifics
                { term: "Hessian Matrix", def: "A square matrix of second-order partial derivatives of a scalar-valued function, used in advanced optimization." },
                { term: "Entropy", def: "A measure of the unpredictability of the state, or equivalently, of its average information content." },
                { term: "Cross-Entropy Loss", def: "A metric used to measure how well a classification model in machine learning performs, calculating the difference between two probability distributions." },
                { term: "Kullback-Leibler (KL) Divergence", def: "A measure of how one probability distribution is different from a second, reference probability distribution." },
                { term: "Manifold Hypothesis", def: "The idea that many high-dimensional data sets that occur in the real world actually lie along low-dimensional latent manifolds." },
                { term: "Soft Margin", def: "A modification in Support Vector Machines allowing some data points to be misclassified in order to achieve a better overall fit." },
                { term: "Markov Decision Process (MDP)", def: "A discrete-time stochastic control process providing a mathematical framework for modeling decision making in situations where outcomes are partly random." },
                { term: "Exploration vs. Exploitation", def: "The dilemma in reinforcement learning between choosing an action with an unknown reward (exploration) or the action with the highest known reward (exploitation)." },
                { term: "Weight Initialization", def: "The procedure to set the initial values of a neural network's weights before training begins." },
                { term: "Early Stopping", def: "A form of regularization used to avoid overfitting when training a learner with an iterative method, stopping when performance on validation data degrades." }
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
            { id: 'todoist_token', type: 'password', label: 'Todoist API Token (Bearer)', required: true }
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
        description: 'Profile stats, active repos, and the 52-week contribution map.',
        minInterval: 3600, // 1 hour
        requiredKeys: [
            { id: 'github_username', type: 'text', label: 'GitHub Username', placeholder: 'Sarin-jacob', required: true },
            { id: 'github_pat', type: 'password', label: 'Personal Access Token (Optional)', placeholder: 'ghp_xxxxxxxxxxxx' }
        ],
        render: async (ctx, width, height, apiKeys) => {
            const username = apiKeys['github_username'] || 'Sarin-jacob';
            const pat = apiKeys['github_pat'];
            
            // Fill entire canvas white initially
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            
            try {
                const headers = {};
                if (pat) headers['Authorization'] = `Bearer ${pat}`;

                // 1. Fetch User Stats
                const userRes = await fetch(`https://api.github.com/users/${username}`, { headers });
                if (!userRes.ok) throw new Error('User not found');
                const user = await userRes.json();

                // 2. Fetch Repos for "Latest Active"
                const reposRes = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=100`, { headers });
                const repos = reposRes.ok ? await reposRes.json() : [];
                
                let latestRepo = repos.length > 0 ? repos[0].name : 'None';
                let topRepo = 'None';
                let topRepoCommits = 0;

                // Fallback: If no PAT, use repo size
                if (repos.length > 0 && !pat) {
                    const biggest = repos.reduce((prev, current) => (prev.size > current.size) ? prev : current);
                    topRepo = biggest.name;
                }

                // 3. Fetch Contributions & Accurate Commit Stats
                let levels = [];
                if (pat) {
                    // GraphQL gets both the grid AND the most worked repo by actual commits
                    const query = `
                    query {
                      user(login: "${username}") {
                        contributionsCollection {
                          commitContributionsByRepository(maxRepositories: 1) {
                            repository { name }
                            contributions { totalCount }
                          }
                          contributionCalendar {
                            weeks {
                              contributionDays { contributionLevel }
                            }
                          }
                        }
                      }
                    }`;
                    
                    const gqlRes = await fetch('https://api.github.com/graphql', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${pat}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query })
                    });
                    const gqlData = await gqlRes.json();
                    if (gqlData.errors) throw new Error(gqlData.errors[0].message);
                    
                    const collection = gqlData.data.user.contributionsCollection;
                    
                    // Extract exact top repo by commits
                    if (collection.commitContributionsByRepository.length > 0) {
                        topRepo = collection.commitContributionsByRepository[0].repository.name;
                        topRepoCommits = collection.commitContributionsByRepository[0].contributions.totalCount;
                    }
                    
                    // Map GraphQL text levels to 0-4 numbers
                    const levelMap = { 'NONE': 0, 'FIRST_QUARTILE': 1, 'SECOND_QUARTILE': 2, 'THIRD_QUARTILE': 3, 'FOURTH_QUARTILE': 4 };
                    collection.contributionCalendar.weeks.forEach(week => {
                        week.contributionDays.forEach(day => {
                            levels.push(levelMap[day.contributionLevel] || 0);
                        });
                    });
                } else {
                    // Fallback to HTML scraper for public-only commits
                    const contribUrl = `https://github.com/users/${username}/contributions`;
                    const contribRes = await fetch(`${CORS_PROXY}${encodeURIComponent(contribUrl)}`);
                    const html = await contribRes.text();
                    
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    const cells = Array.from(doc.querySelectorAll('[data-level]'));
                    levels = cells.map(c => parseInt(c.getAttribute('data-level')) || 0);
                }

                // --- Drawing the Layout ---

                // 1. Black Header Block (White on Black)
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, width, 140);
                
                // Name
                ctx.fillStyle = 'white';
                canvasUtils.fitTextSingleLine(ctx, (user.name || user.login).toUpperCase(), 40, 60, width - 80, 45, 'bold');
                
                // Stats Handle
                ctx.fillStyle = '#ccc'; // Light gray looks great on black
                canvasUtils.fitTextSingleLine(ctx, `@${user.login}  |  Followers: ${user.followers}  |  Repos: ${user.public_repos}`, 40, 110, width - 80, 24, 'bold', 'monospace');
                
                // 2. Repo Stats Section (Black on White)
                ctx.fillStyle = '#333';
                canvasUtils.fitTextSingleLine(ctx, `Latest Active: ${latestRepo}`, 40, 180, width / 2 - 50, 22, 'bold', 'monospace');
                
                // Show actual commit count if PAT was used, otherwise show size warning
                const topRepoText = (pat && topRepoCommits > 0) 
                    ? `Top Repo: ${topRepo} (${topRepoCommits} commits)`
                    : `Largest Repo: ${topRepo}`;
                canvasUtils.fitTextSingleLine(ctx, topRepoText, width / 2 + 10, 180, width / 2 - 50, 22, 'bold', 'monospace');
                
                // Divider Line
                ctx.fillStyle = 'black';
                ctx.fillRect(40, 220, width - 80, 2);

                // --- Drawing the Contribution Graph ---
                const boxSize = 10;
                const gap = 3;
                const startX = 40;
                const startY = 300;
                
                ctx.fillStyle = 'black';
                canvasUtils.fitTextSingleLine(ctx, `Last 365 Days of Code ${pat ? '(Authenticated)' : '(Public Only)'}`, startX, startY - 20, width - 80, 24, 'bold');
                
                // Draw Day Labels
                ctx.font = '14px monospace';
                ctx.fillStyle = '#555';
                ctx.fillText('Mon', startX, startY + (boxSize+gap)*1 + 10);
                ctx.fillText('Wed', startX, startY + (boxSize+gap)*3 + 10);
                ctx.fillText('Fri', startX, startY + (boxSize+gap)*5 + 10);

                const graphStartX = startX + 40;

                for (let i = 0; i < levels.length; i++) {
                    const level = levels[i];
                    const row = i % 7; 
                    const col = Math.floor(i / 7);
                    
                    const x = graphStartX + (col * (boxSize + gap));
                    const y = startY + (row * (boxSize + gap));
                    
                    ctx.fillStyle = 'black';
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 1;
                    
                    if (level === 0) {
                        ctx.strokeRect(x, y, boxSize, boxSize); // Empty outline
                    } else if (level === 1 || level === 2) {
                        ctx.strokeRect(x, y, boxSize, boxSize); 
                        ctx.fillRect(x + 2, y + 2, boxSize - 4, boxSize - 4); // Medium dot
                    } else {
                        ctx.fillRect(x, y, boxSize, boxSize); // Solid block
                    }
                }

            } catch (err) {
                ctx.fillStyle = 'black';
                canvasUtils.fitTextSingleLine(ctx, `Error fetching profile. Check API limits or Token.`, 30, 150, width - 60, 30);
                console.error(err);
            }
        }
    },
    {
        id: 'chess_daily',
        theme: 'Puzzles & Games',
        name: 'Daily Chess Puzzle',
        description: 'Draws the Chess.com daily puzzle directly to the screen.',
        minInterval: 43200, // 12 hours (Updates once a day)
        requiredKeys: [],
        render: async (ctx, width, height, apiKeys) => {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            
            try {
                // Chess.com has a great, free API for the daily puzzle
                const res = await fetch('https://api.chess.com/pub/puzzle');
                const data = await res.json();
                
                // Extract the board layout (FEN string) and whose turn it is
                const fenParts = data.fen.split(' ');
                const boardFen = fenParts[0];
                const turn = fenParts[1] === 'w' ? 'White to move' : 'Black to move';

                // --- Layout Settings ---
                const boardSize = 400;
                const squareSize = boardSize / 8;
                const startX = 40;
                const startY = 40;

                // --- Draw the Board ---
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 4;
                ctx.strokeRect(startX, startY, boardSize, boardSize);

                for (let row = 0; row < 8; row++) {
                    for (let col = 0; col < 8; col++) {
                        // Alternate square colors (White and Dithered Gray)
                        const isLight = (row + col) % 2 === 0;
                        ctx.fillStyle = isLight ? 'white' : '#ccc';
                        ctx.fillRect(startX + (col * squareSize), startY + (row * squareSize), squareSize, squareSize);
                    }
                }

                // --- Parse FEN and Draw Pieces ---
                // Unicode chess pieces map
                const pieces = {
                    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙', // White
                    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'  // Black
                };

                const rows = boardFen.split('/');
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                // Use standard fonts that have good unicode support
                ctx.font = `${squareSize * 0.8}px Arial, "Segoe UI Symbol"`; 

                rows.forEach((rowString, rowIndex) => {
                    let colIndex = 0;
                    for (let char of rowString) {
                        if (!isNaN(char)) {
                            // If it's a number, skip that many empty squares
                            colIndex += parseInt(char);
                        } else {
                            // If it's a letter, draw the piece
                            ctx.fillStyle = 'black';
                            const px = startX + (colIndex * squareSize) + (squareSize / 2);
                            const py = startY + (rowIndex * squareSize) + (squareSize / 2);
                            ctx.fillText(pieces[char], px, py + 4); // +4 is a slight optical adjustment
                            colIndex++;
                        }
                    }
                });

                // Reset canvas defaults
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';

                // --- Draw Text Information ---
                const textStartX = startX + boardSize + 40;
                ctx.fillStyle = 'black';
                canvasUtils.fitTextSingleLine(ctx, 'Daily Chess Puzzle', textStartX, 100, width - textStartX - 20, 40, 'bold');
                
                ctx.fillStyle = '#555';
                canvasUtils.fitTextSingleLine(ctx, data.title, textStartX, 140, width - textStartX - 20, 24, 'italic');
                
                ctx.fillRect(textStartX, 160, width - textStartX - 40, 2);
                
                ctx.fillStyle = 'black';
                canvasUtils.fitTextSingleLine(ctx, turn.toUpperCase(), textStartX, 220, width - textStartX - 20, 35, 'bold', 'monospace');

            } catch (err) {
                ctx.fillStyle = 'black';
                canvasUtils.fitTextSingleLine(ctx, 'Error loading chess puzzle.', 40, 100, width - 80, 30);
                console.error(err);
            }
        }
    },
    {
        id: 'sudoku_daily',
        theme: 'Puzzles & Games',
        name: 'Daily Sudoku',
        description: 'Generates a random playable Sudoku grid.',
        minInterval: 3600, // 1 hour
        requiredKeys: [],
        render: async (ctx, width, height, apiKeys) => {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            
            try {
                // Free Sudoku API
                const res = await fetch(`${CORS_PROXY}${encodeURIComponent('https://sudoku-api.vercel.app/api/dosuku')}`);
                const data = await res.json();
                
                const grid = data.newboard.grids[0].value;
                const difficulty = data.newboard.grids[0].difficulty;

                // --- Layout Settings ---
                const boardSize = 420; // Must be divisible by 9
                const cellSize = boardSize / 9;
                const startX = 40;
                const startY = 30;

                // --- Draw the Grid Cells ---
                ctx.fillStyle = 'black';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = 'bold 28px monospace';

                for (let r = 0; r < 9; r++) {
                    for (let c = 0; c < 9; c++) {
                        const x = startX + (c * cellSize);
                        const y = startY + (r * cellSize);
                        
                        // Draw thin cell borders
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = '#999';
                        ctx.strokeRect(x, y, cellSize, cellSize);

                        // Draw Numbers (0 means empty square)
                        if (grid[r][c] !== 0) {
                            ctx.fillText(grid[r][c], x + (cellSize / 2), y + (cellSize / 2) + 2);
                        }
                    }
                }

                // --- Draw the Thick 3x3 Block Borders ---
                ctx.lineWidth = 4;
                ctx.strokeStyle = 'black';
                ctx.strokeRect(startX, startY, boardSize, boardSize);
                
                for (let i = 1; i < 3; i++) {
                    // Vertical thick lines
                    ctx.beginPath();
                    ctx.moveTo(startX + (i * 3 * cellSize), startY);
                    ctx.lineTo(startX + (i * 3 * cellSize), startY + boardSize);
                    ctx.stroke();
                    
                    // Horizontal thick lines
                    ctx.beginPath();
                    ctx.moveTo(startX, startY + (i * 3 * cellSize));
                    ctx.lineTo(startX + boardSize, startY + (i * 3 * cellSize));
                    ctx.stroke();
                }

                // Reset canvas defaults
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';

                // --- Draw Text Info ---
                const textStartX = startX + boardSize + 40;
                canvasUtils.fitTextSingleLine(ctx, 'SUDOKU', textStartX, 100, width - textStartX - 20, 50, 'bold', 'monospace');
                
                ctx.fillStyle = '#555';
                canvasUtils.fitTextSingleLine(ctx, `Difficulty: ${difficulty}`, textStartX, 150, width - textStartX - 20, 24, 'normal');

            } catch (err) {
                ctx.fillStyle = 'black';
                canvasUtils.fitTextSingleLine(ctx, 'Error loading Sudoku data.', 40, 100, width - 80, 30);
                console.error(err);
            }
        }
    },
    {
        id: 'maze_generator',
        theme: 'Puzzles & Games',
        name: 'Random Maze Generator',
        description: 'Algorithmic DFS maze generation. Solvable every time.',
        minInterval: 60, // Updates as fast as every minute
        requiredKeys: [],
        render: async (ctx, width, height, apiKeys) => {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);

            // --- Maze Settings ---
            const cols = 40;
            const rows = 24;
            const cellSize = 18; // 40*18 = 720 width, 24*18 = 432 height
            const startX = (width - (cols * cellSize)) / 2;
            const startY = (height - (rows * cellSize)) / 2;

            // Initialize Grid (each cell has 4 walls: top, right, bottom, left)
            let grid = [];
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    grid.push({ r, c, walls: [true, true, true, true], visited: false });
                }
            }

            const index = (r, c) => (r < 0 || c < 0 || r > rows - 1 || c > cols - 1) ? -1 : c + r * cols;

            // --- Depth-First Search Maze Generation ---
            let current = grid[0];
            current.visited = true;
            let stack = [];

            while (true) {
                // Find unvisited neighbors
                let neighbors = [];
                let top    = grid[index(current.r - 1, current.c)];
                let right  = grid[index(current.r, current.c + 1)];
                let bottom = grid[index(current.r + 1, current.c)];
                let left   = grid[index(current.r, current.c - 1)];

                if (top && !top.visited) neighbors.push({cell: top, wallC: 0, wallN: 2});
                if (right && !right.visited) neighbors.push({cell: right, wallC: 1, wallN: 3});
                if (bottom && !bottom.visited) neighbors.push({cell: bottom, wallC: 2, wallN: 0});
                if (left && !left.visited) neighbors.push({cell: left, wallC: 3, wallN: 1});

                if (neighbors.length > 0) {
                    // Choose random neighbor
                    let next = neighbors[Math.floor(Math.random() * neighbors.length)];
                    stack.push(current);
                    
                    // Remove walls between them
                    current.walls[next.wallC] = false;
                    next.cell.walls[next.wallN] = false;
                    
                    current = next.cell;
                    current.visited = true;
                } else if (stack.length > 0) {
                    current = stack.pop();
                } else {
                    break; // Maze complete
                }
            }

            // Create Entry and Exit
            grid[0].walls[3] = false; // Top-Left entry
            grid[grid.length - 1].walls[1] = false; // Bottom-Right exit

            // --- Draw the Maze ---
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.lineCap = 'square';

            for (let i = 0; i < grid.length; i++) {
                let cell = grid[i];
                let x = startX + (cell.c * cellSize);
                let y = startY + (cell.r * cellSize);

                ctx.beginPath();
                if (cell.walls[0]) { ctx.moveTo(x, y); ctx.lineTo(x + cellSize, y); } // Top
                if (cell.walls[1]) { ctx.moveTo(x + cellSize, y); ctx.lineTo(x + cellSize, y + cellSize); } // Right
                if (cell.walls[2]) { ctx.moveTo(x + cellSize, y + cellSize); ctx.lineTo(x, y + cellSize); } // Bottom
                if (cell.walls[3]) { ctx.moveTo(x, y + cellSize); ctx.lineTo(x, y); } // Left
                ctx.stroke();
            }

            // Add little "Start" and "End" text
            ctx.fillStyle = 'black';
            ctx.font = 'bold 12px Arial';
            ctx.fillText('IN', startX - 20, startY + 14);
            ctx.fillText('OUT', startX + (cols * cellSize) + 4, startY + (rows * cellSize) - 4);
        }
    },
    {
        id: 'markdown_notes',
        theme: 'Productivity',
        name: 'Markdown Scratchpad',
        description: 'Render custom notes, lists, and to-dos using simple Markdown.',
        minInterval: 60,
        requiredKeys: [
            { id: 'md_content', type: 'textarea', label: 'Notes Content (Markdown format)', placeholder: '# Daily Plan\n\n- Review PRs\n[ ] Fix server bug\n[x] Drink coffee' }
        ],
        render: async (ctx, width, height, apiKeys) => {
            // Default placeholder if the user hasn't typed anything yet
            const content = apiKeys['md_content'] || '# Scratchpad\n\nNothing written yet...\n\nClick Settings to add your notes.';
            
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = 'black';
            
            const lines = content.split('\n');
            let yPos = 50;
            const startX = 40;
            const maxW = width - 80;

            for (let i = 0; i < lines.length; i++) {
                let line = lines[i].trim();
                
                if (!line) {
                    yPos += 20; // Add paragraph spacing for empty lines
                    continue;
                }

                let textX = startX;
                let drawW = maxW;
                let size = 28;
                let weight = 'normal';
                let isTask = false;
                let isChecked = false;

                // --- Simple Markdown Parser ---
                if (line.startsWith('# ')) {
                    size = 48; weight = 'bold';
                    line = line.substring(2);
                    yPos += 15; // Extra padding above headers
                } else if (line.startsWith('## ')) {
                    size = 36; weight = 'bold';
                    line = line.substring(3);
                    yPos += 10;
                } else if (line.startsWith('- ') || line.startsWith('* ')) {
                    line = line.substring(2);
                    // Draw Bullet Point
                    ctx.beginPath();
                    ctx.arc(startX + 10, yPos + 14, 6, 0, Math.PI * 2);
                    ctx.fill();
                    
                    textX = startX + 35;
                    drawW = maxW - 35;
                } else if (line.startsWith('[ ] ')) {
                    isTask = true;
                    line = line.substring(4);
                } else if (line.startsWith('[x] ') || line.startsWith('[X] ')) {
                    isTask = true;
                    isChecked = true;
                    line = line.substring(4);
                    ctx.fillStyle = '#666'; // Dim completed tasks
                }

                // --- Draw Checkboxes ---
                if (isTask) {
                    textX = startX + 45;
                    drawW = maxW - 45;
                    
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = isChecked ? '#666' : 'black';
                    ctx.strokeRect(startX + 2, yPos + 2, 24, 24);
                    
                    if (isChecked) {
                        // Draw a checkmark inside the box
                        ctx.beginPath();
                        ctx.moveTo(startX + 6, yPos + 14);
                        ctx.lineTo(startX + 12, yPos + 20);
                        ctx.lineTo(startX + 22, yPos + 6);
                        ctx.stroke();
                        
                        // Draw a strikethrough line across the text
                        const textWidth = ctx.measureText(line).width;
                        ctx.beginPath();
                        ctx.moveTo(textX, yPos + 14);
                        ctx.lineTo(textX + textWidth + 10, yPos + 14);
                        ctx.stroke();
                    }
                }

                // Render the text line using the smart wrapper
                const result = canvasUtils.fitTextMultiLine(ctx, line, textX, yPos, drawW, height - yPos, size, weight);
                yPos += result.totalHeight + 15; // Move down for the next line

                ctx.fillStyle = 'black'; // Reset fill style for next loop
                
                // Stop rendering if we've run off the bottom of the e-ink screen
                if (yPos > height - 20) break;
            }
        }
    },
    {
        id: 'screensaver_10print',
        theme: 'Screensavers',
        name: '10 PRINT Geometry',
        description: 'Classic algorithmic art. Generates a new pattern every refresh.',
        minInterval: 60,
        requiredKeys: [],
        render: async (ctx, width, height, apiKeys) => {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 4;
            ctx.lineCap = 'square';
            
            const step = 40; // Size of the geometric blocks
            
            ctx.beginPath();
            for (let x = 0; x < width; x += step) {
                for (let y = 0; y < height; y += step) {
                    if (Math.random() > 0.5) {
                        // Draw \
                        ctx.moveTo(x, y);
                        ctx.lineTo(x + step, y + step);
                    } else {
                        // Draw /
                        ctx.moveTo(x + step, y);
                        ctx.lineTo(x, y + step);
                    }
                }
            }
            ctx.stroke();

            // Add a slick label in the bottom corner
            ctx.fillStyle = 'white';
            ctx.fillRect(width - 150, height - 40, 150, 40);
            ctx.fillStyle = 'black';
            ctx.font = 'bold 16px monospace';
            ctx.fillText('SYS.10_PRINT', width - 130, height - 15);
        }
    },
    {
        id: 'screensaver_hexrain',
        theme: 'Screensavers',
        name: 'Hex Data Rain',
        description: 'A static snapshot of cascading hexadecimal code.',
        minInterval: 60,
        requiredKeys: [],
        render: async (ctx, width, height, apiKeys) => {
            // Dark mode background
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, width, height);
            
            const fontSize = 18;
            ctx.font = `bold ${fontSize}px monospace`;
            ctx.textAlign = 'center';

            const cols = Math.floor(width / fontSize);
            const rows = Math.floor(height / fontSize);

            // Generate "rain drops" for each column
            for (let i = 0; i < cols; i++) {
                // Randomly decide how far down this column the "rain" has fallen
                const dropLength = Math.floor(Math.random() * rows);
                const x = i * fontSize + (fontSize / 2);

                for (let j = 0; j < dropLength; j++) {
                    const y = j * fontSize + fontSize;
                    
                    // Generate a random Hex character (0-9, A-F)
                    const char = Math.floor(Math.random() * 16).toString(16).toUpperCase();
                    
                    // The bottom-most character is white (the "head" of the drop)
                    // The rest fade into gray (which dithers beautifully on e-ink)
                    if (j === dropLength - 1) {
                        ctx.fillStyle = 'white';
                    } else if (j > dropLength - 5) {
                        ctx.fillStyle = '#ccc'; // Light gray
                    } else {
                        ctx.fillStyle = '#555'; // Dark gray tail
                    }
                    
                    // Occasionally blank out characters to create "gaps" in the stream
                    if (Math.random() > 0.1) {
                        ctx.fillText(char, x, y);
                    }
                }
            }
            ctx.textAlign = 'left'; // Reset
        }
    },
    {
        id: 'screensaver_lissajous',
        theme: 'Screensavers',
        name: 'Harmonic Lissajous',
        description: 'Mathematical curves that slowly evolve over time.',
        minInterval: 60,
        requiredKeys: [],
        render: async (ctx, width, height, apiKeys) => {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);

            // Use the current time to slowly mutate the math parameters
            const timeOffset = Date.now() / 1000000;
            const a = 3 + Math.sin(timeOffset); // Frequency X
            const b = 2 + Math.cos(timeOffset * 0.8); // Frequency Y
            const delta = timeOffset * 2; // Phase shift

            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            
            // Draw a subtle background grid
            ctx.beginPath();
            ctx.strokeStyle = '#eee'; // Dithers to very light gray
            for(let i = 0; i < width; i+= 50) { ctx.moveTo(i, 0); ctx.lineTo(i, height); }
            for(let i = 0; i < height; i+= 50) { ctx.moveTo(0, i); ctx.lineTo(width, i); }
            ctx.stroke();

            // Draw the Lissajous Curve
            ctx.beginPath();
            ctx.strokeStyle = 'black';
            for (let t = 0; t <= Math.PI * 100; t += 0.02) {
                // Parametric equations for x and y
                const x = (width / 2) + (width / 2.5) * Math.sin(a * t + delta);
                const y = (height / 2) + (height / 2.5) * Math.sin(b * t);
                
                if (t === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            
            // Data overlay
            ctx.fillStyle = 'black';
            ctx.font = '14px monospace';
            ctx.fillText(`f(x)=sin(${a.toFixed(2)}t + ${delta.toFixed(2)})`, 20, height - 35);
            ctx.fillText(`f(y)=sin(${b.toFixed(2)}t)`, 20, height - 15);
        }
    },
    {
        id: 'wiki_on_this_day',
        theme: 'Knowledge & Trivia',
        name: 'On This Day in History',
        description: 'Historical events that happened on today\'s date.',
        minInterval: 3600, // 1 hour
        requiredKeys: [],
        render: async (ctx, width, height, apiKeys) => {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            
            const now = new Date();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const displayDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

            ctx.fillStyle = 'black';
            canvasUtils.fitTextSingleLine(ctx, `On This Day: ${displayDate}`, 40, 60, width - 80, 40, 'bold');
            ctx.fillRect(40, 80, width - 80, 4);

            try {
                // Free Wikipedia REST API
                const url = `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`;
                const res = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`);
                const data = await res.json();

                if (!data.events || data.events.length === 0) throw new Error('No events found.');

                // Pick 3 random historical events from the list so it feels fresh
                const shuffled = data.events.sort(() => 0.5 - Math.random());
                const selectedEvents = shuffled.slice(0, 3);
                
                // Sort them chronologically just for neatness
                selectedEvents.sort((a, b) => a.year - b.year);

                let yPos = 130;
                const availableHeight = height - 120;
                const ySpacing = Math.min(100, availableHeight / 3);

                selectedEvents.forEach((ev) => {
                    // Draw the Year in a black block for emphasis
                    ctx.fillStyle = 'black';
                    ctx.fillRect(40, yPos - 30, 90, 40);
                    ctx.fillStyle = 'white';
                    ctx.textAlign = 'center';
                    ctx.font = 'bold 24px Arial';
                    ctx.fillText(ev.year, 85, yPos - 2);
                    
                    ctx.textAlign = 'left';
                    ctx.fillStyle = 'black';

                    // Clean up the Wikipedia text (sometimes it's very long)
                    let text = ev.text;
                    if (text.length > 200) text = text.substring(0, 197) + '...';

                    // Wrap the historical text beautifully next to the year block
                    const textX = 150;
                    const textWidth = width - textX - 40;
                    
                    canvasUtils.fitTextMultiLine(ctx, text, textX, yPos - 25, textWidth, ySpacing - 10, 24, 'normal', 'Arial', 1.3);
                    
                    yPos += ySpacing;
                });

            } catch (err) {
                ctx.fillStyle = 'black';
                canvasUtils.fitTextSingleLine(ctx, 'Error fetching Wikipedia history.', 40, 150, width - 80, 30);
                console.error(err);
            }
        }
    },
    {
        id: 'lunar_phase',
        theme: 'Science & Discovery',
        name: 'Procedural Lunar Phase',
        description: 'Mathematically calculates and draws the current moon phase.',
        minInterval: 3600, // 1 hour
        requiredKeys: [],
        render: async (ctx, width, height, apiKeys) => {
            // --- Astronomical Math ---
            const synodicMonth = 29.53058867;
            const newMoon2000 = new Date(Date.UTC(2000, 0, 6, 18, 14, 0)).getTime();
            const now = Date.now();
            const daysSinceNew = (now - newMoon2000) / (1000 * 60 * 60 * 24);
            const currentAge = daysSinceNew % synodicMonth;
            
            const phase = currentAge / synodicMonth; 
            
            let phaseName = 'New Moon';
            if (phase > 0.02 && phase < 0.23) phaseName = 'Waxing Crescent';
            else if (phase >= 0.23 && phase < 0.27) phaseName = 'First Quarter';
            else if (phase >= 0.27 && phase < 0.48) phaseName = 'Waxing Gibbous';
            else if (phase >= 0.48 && phase < 0.52) phaseName = 'Full Moon';
            else if (phase >= 0.52 && phase < 0.73) phaseName = 'Waning Gibbous';
            else if (phase >= 0.73 && phase < 0.77) phaseName = 'Third Quarter';
            else if (phase >= 0.77 && phase < 0.98) phaseName = 'Waning Crescent';

            // --- Draw Background (Tight Cross-Hatch) ---
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            
            ctx.strokeStyle = '#ccc'; // Light grey dithers nicely
            ctx.lineWidth = 1; // Thinner lines prevent the cross-hatch from getting muddy
            const gap = 10; // Closer together!
            
            // Draw diagonal lines (Top-Right to Bottom-Left)
            for (let i = -height; i < width + height; i += gap) {
                ctx.beginPath();
                ctx.moveTo(i, 0);
                ctx.lineTo(i - height, height);
                ctx.stroke();
            }

            // Draw diagonal lines (Top-Left to Bottom-Right)
            for (let i = -height; i < width + height; i += gap) {
                ctx.beginPath();
                ctx.moveTo(i, 0);
                ctx.lineTo(i + height, height);
                ctx.stroke();
            }

            const cx = width / 2;
            const cy = height / 2 - 30; // Shifted up slightly
            const radius = 150;

            // --- Draw the Moon ---
            // 1. Draw the base white circle (Erases the cross-hatch underneath)
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();

            // 2. Overlay the shadow to create the phase
            ctx.fillStyle = 'black';
            ctx.beginPath();
            if (phase < 0.5) {
                // Waxing: Left half is dark
                ctx.arc(cx, cy, radius, Math.PI / 2, Math.PI * 1.5);
            } else {
                // Waning: Right half is dark
                ctx.arc(cx, cy, radius, Math.PI * 1.5, Math.PI / 2);
            }
            ctx.fill();

            // 3. Draw the terminator line (the curved ellipse)
            const terminatorWidth = radius * Math.abs(Math.cos(phase * Math.PI * 2));
            
            ctx.beginPath();
            if ((phase > 0 && phase < 0.25) || (phase > 0.75 && phase < 1.0)) {
                ctx.fillStyle = 'black';
            } else {
                ctx.fillStyle = 'white';
            }
            ctx.ellipse(cx, cy, terminatorWidth, radius, 0, 0, Math.PI * 2);
            ctx.fill();

            // 4. Draw a thick black border around the whole moon to separate it from hashlines!
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.stroke();

            // --- Draw the Info Text Banner ---
            // Draw a solid black block at the bottom so the text isn't lost in the hashlines
            ctx.fillStyle = 'black';
            ctx.fillRect(40, height - 110, width - 80, 90);
            
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            
            // Phase Name
            canvasUtils.fitTextSingleLine(ctx, phaseName.toUpperCase(), cx, height - 60, width - 100, 36, 'bold', 'monospace');
            
            // Illumination Percentage
            const illumination = (0.5 * (1 - Math.cos(phase * Math.PI * 2)) * 100).toFixed(1);
            
            ctx.fillStyle = '#ccc'; 
            canvasUtils.fitTextSingleLine(ctx, `Illumination: ${illumination}%  |  Age: ${currentAge.toFixed(1)} Days`, cx, height - 35, width - 100, 18, 'normal', 'monospace');
            
            ctx.textAlign = 'left'; // Reset
        }
    },
    {
        id: 'random_fact',
        theme: 'Knowledge & Trivia',
        name: 'Random Fun Fact',
        description: 'Displays a completely random (but true) interesting fact.',
        minInterval: 3600, // 1 hour
        requiredKeys: [],
        render: async (ctx, width, height, apiKeys) => {
            ctx.fillStyle = 'white'; 
            ctx.fillRect(0, 0, width, height);
            
            try {
                // Free, no-auth API for random facts
                const url = 'https://uselessfacts.jsph.pl/api/v2/facts/random';
                const res = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`);
                const data = await res.json();
                const fact = data.text;

                // --- Header ---
                ctx.fillStyle = 'black';
                canvasUtils.fitTextSingleLine(ctx, 'DID YOU KNOW?', 40, 80, width - 80, 45, 'bold');
                ctx.fillRect(40, 100, width - 80, 4);

                // --- Huge Decorative Quotes ---
                ctx.fillStyle = '#ccc'; // Dithers to light grey
                ctx.font = 'bold 150px Georgia';
                ctx.fillText('"', 40, 220);

                // --- The Fact ---
                ctx.fillStyle = 'black';
                // We start the text a bit to the right to leave room for the giant quote mark
                canvasUtils.fitTextMultiLine(ctx, fact, 90, 160, width - 140, 250, 40, 'normal', 'Arial', 1.4);

            } catch (err) {
                ctx.fillStyle = 'black';
                canvasUtils.fitTextSingleLine(ctx, 'Error fetching daily fact.', 40, 150, width - 80, 30);
                console.error(err);
            }
        }
    },
    {
        id: 'daily_trivia',
        theme: 'Knowledge & Trivia',
        name: 'Trivia Challenge',
        description: 'A random trivia question and answer from OpenTDB.',
        minInterval: 3600, // 1 hour
        requiredKeys: [],
        render: async (ctx, width, height, apiKeys) => {
            ctx.fillStyle = 'white'; 
            ctx.fillRect(0, 0, width, height);
            
            try {
                // Free Trivia API (1 random question)
                const url = 'https://opentdb.com/api.php?amount=1';
                const res = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`);
                const data = await res.json();
                const item = data.results[0];

                // Native browser helper to safely decode HTML entities like &quot; or &#039;
                const decodeHTML = (html) => {
                    const txt = document.createElement("textarea");
                    txt.innerHTML = html;
                    return txt.value;
                };

                const category = decodeHTML(item.category);
                const question = decodeHTML(item.question);
                const answer = decodeHTML(item.correct_answer);

                // --- Black Header Block ---
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, width, 130);

                ctx.fillStyle = 'white';
                ctx.textAlign = 'center';
                canvasUtils.fitTextSingleLine(ctx, 'TRIVIA CHALLENGE', width / 2, 60, width - 80, 40, 'bold', 'monospace');
                
                ctx.fillStyle = '#ccc';
                canvasUtils.fitTextSingleLine(ctx, `Category: ${category}`, width / 2, 100, width - 80, 20, 'italic');
                
                ctx.textAlign = 'left';

                // --- The Question ---
                ctx.fillStyle = 'black';
                canvasUtils.fitTextMultiLine(ctx, question, 40, 180, width - 80, 180, 45, 'bold');

                // --- The Answer Block ---
                // Hidden inside a solid black block at the bottom
                ctx.fillStyle = 'black';
                ctx.fillRect(40, height - 90, width - 80, 70);
                
                ctx.fillStyle = 'white';
                ctx.textAlign = 'center';
                canvasUtils.fitTextSingleLine(ctx, `ANSWER: ${answer}`, width / 2, height - 48, width - 100, 26, 'bold', 'monospace');
                
                ctx.textAlign = 'left'; // Reset

            } catch (err) {
                ctx.fillStyle = 'black';
                canvasUtils.fitTextSingleLine(ctx, 'Error fetching trivia question.', 40, 200, width - 80, 30);
                console.error(err);
            }
        }
    }
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
        } else if (keyDef.type === 'textarea') {
            inputHtml = `<textarea data-key="${keyDef.id}" class="apikey-input w-full border dark:border-gray-600 bg-white dark:bg-gray-700 p-2 rounded focus:ring-black dark:focus:ring-gray-500 font-mono text-sm" rows="6" placeholder="${keyDef.placeholder || ''}">${savedValue}</textarea>`;   
        } else { 
            inputHtml = `<input type="text" data-key="${keyDef.id}" class="apikey-input dark:text-gray-50 dark:bg-gray-800 w-full border p-2 rounded text-sm focus:ring-black focus:border-black" placeholder="${keyDef.placeholder || ''}" value="${savedValue}">`;
        }
        const requiredBadge = keyDef.required ? 
            '<span class="text-red-500">*</span>' : 
            '<span class="text-gray-400 font-normal text-xs ml-1">(Optional)</span>';
        wrapper.innerHTML = `
            <label class="block text-sm font-medium mb-1 mt-3 dark:text-gray-50 text-gray-700">${keyDef.label || keyDef.id} ${requiredBadge}</label>
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
        // If the key doesn't explicitly have `required: true`, ignore it.
        if (keyDef.required !== true) return false;
        
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