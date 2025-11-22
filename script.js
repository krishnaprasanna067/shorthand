let url = new URLSearchParams(window.location.search);
let vol = url.get("volume");
let pas = url.get("passage");

if (vol && pas) {
    document.getElementById("titleHead").innerText =
        `Volume ${vol} - Passage ${pas}`;
}

function playAudio(speed) {
    let audio = document.getElementById("audioPlayer");
    audio.src = `audios/volume${vol}/p${pas}_${speed}.mp3`;
    audio.play();
}

function pauseAudio() {
    document.getElementById("audioPlayer").pause();
}
// --------------------
// Helper: compute word-level edit distance with backtrace
// returns {distance, ops, alignedRef, alignedUser}
// ops is array of 'eq'|'sub'|'ins'|'del' for each aligned column
// alignedRef/alignedUser are arrays with '' for gaps
// --------------------
function computeEditAlignment(refWords, userWords) {
    const n = refWords.length;
    const m = userWords.length;
    // dp matrix distances
    const dp = Array.from({length: n+1}, () => Array(m+1).fill(0));
    const bt = Array.from({length: n+1}, () => Array(m+1).fill(null)); // backtrace

    // init
    for (let i=1;i<=n;i++){ dp[i][0] = i; bt[i][0] = 'del'; }
    for (let j=1;j<=m;j++){ dp[0][j] = j; bt[0][j] = 'ins'; }

    // fill
    for (let i=1;i<=n;i++){
        for (let j=1;j<=m;j++){
            const costSub = (refWords[i-1].toLowerCase() === userWords[j-1].toLowerCase()) ? 0 : 1;
            // substitution or match
            dp[i][j] = dp[i-1][j-1] + costSub;
            bt[i][j] = (costSub===0) ? 'eq' : 'sub';

            // deletion (remove ref word)
            if (dp[i-1][j] + 1 < dp[i][j]) {
                dp[i][j] = dp[i-1][j] + 1;
                bt[i][j] = 'del';
            }
            // insertion (user extra)
            if (dp[i][j-1] + 1 < dp[i][j]) {
                dp[i][j] = dp[i][j-1] + 1;
                bt[i][j] = 'ins';
            }
        }
    }

    // backtrace to build alignment
    let i = n, j = m;
    const alignedRef = [];
    const alignedUser = [];
    const ops = [];

    while (i>0 || j>0) {
        const op = bt[i][j];
        if (!op) break;
        if (op === 'eq') {
            alignedRef.unshift(refWords[i-1]);
            alignedUser.unshift(userWords[j-1]);
            ops.unshift('eq');
            i--; j--;
        } else if (op === 'sub') {
            alignedRef.unshift(refWords[i-1]);
            alignedUser.unshift(userWords[j-1]);
            ops.unshift('sub');
            i--; j--;
        } else if (op === 'del') {
            alignedRef.unshift(refWords[i-1]);
            alignedUser.unshift('');
            ops.unshift('del');
            i--;
        } else if (op === 'ins') {
            alignedRef.unshift('');
            alignedUser.unshift(userWords[j-1]);
            ops.unshift('ins');
            j--;
        } else {
            // fallback
            break;
        }
    }

    return { distance: dp[n][m], ops, alignedRef, alignedUser };
}


// --------------------
// New analyseText() using word-level edit distance alignment
// --------------------
async function analyseText() {
    const f = document.getElementById("inputFile").files[0];
    if (!f) return alert("Choose a .txt file first.");

    const userText = await f.text();

    // LOAD ORIGINAL
    let originalText;
    try {
        const resp = await fetch(`p${pas}.txt`);
        if (!resp.ok) throw new Error("Original passage file not found");
        originalText = await resp.text();
    } catch (err) {
        document.getElementById("result").innerHTML =
            `<p style="color:red">Error loading original passage: ${err.message}</p>`;
        return;
    }

    // NORMALISE TEXT
    const clean = s =>
        s.replace(/[“”‘’„"(){}[\],;:?<>!]/g, '')
         .replace(/\s+/g, ' ')
         .trim();

    const refWords = clean(originalText).split(/\s+/);
    const userWords = clean(userText).split(/\s+/);

    // ALIGNING WORDS (LEVENSHTEIN)
    const { distance, ops, alignedRef, alignedUser } =
        computeEditAlignment(refWords, userWords);

    // ERROR COUNTERS
    let subs = 0, dels = 0, ins = 0, caps = 0;

    let origHTML = "";
    let userHTML = "";

    for (let i = 0; i < alignedRef.length; i++) {
        const op = ops[i];
        const r = alignedRef[i] || "";
        const u = alignedUser[i] || "";

        // MATCH (but check capitalization)
        if (op === "eq") {
            if (r !== u) {
                // Case differs → 0.5 error
                caps += 0.5;
                origHTML += `<span style="background:#fff3cd">${r}</span> `;
                userHTML += `<span style="background:#fff3cd">${u}</span> `;
            } else {
                origHTML += `<span>${r}</span> `;
                userHTML += `<span>${u}</span> `;
            }
        }

        // WRONG WORD (substitution = 1 error)
        else if (op === "sub") {
            subs++;
            origHTML += `<span style="background:#ffd6d6">${r}</span> `;
            userHTML += `<span style="background:#ffd6d6">${u}</span> `;
        }

        // MISSING WORD (deletion = 1 error)
        else if (op === "del") {
            dels++;
            origHTML += `<span style="background:#ffb3b3">${r}</span> `;
            userHTML += `<span style="color:#999">—</span> `;
        }

        // EXTRA WORD (insertion = 1 error)
        else if (op === "ins") {
            ins++;
            origHTML += `<span style="color:#999">—</span> `;
            userHTML += `<span style="background:#ffe0b3">${u}</span> `;
        }
    }

    // FINAL ERROR COUNT
    const totalErrors = subs + dels + ins + caps;
    const totalRefWords = refWords.length;
    const errorPercent = ((totalErrors / totalRefWords) * 100).toFixed(2);

    // RENDER RESULTS
    document.getElementById("result").innerHTML = `
        <h3><b>Analysis Result</b></h3>
        <p><b>Total Words:</b> ${totalRefWords}</p>
        <p><b>Substitutions (Wrong Words):</b> ${subs}</p>
        <p><b>Deletions (Missing Words):</b> ${dels}</p>
        <p><b>Insertions (Extra Words):</b> ${ins}</p>
        <p><b>Capitalisation Mistakes (0.5 each):</b> ${caps}</p>
        <p><b>Total Error Score:</b> ${totalErrors}</p>
        <p><b>Error Percentage:</b> ${errorPercent}%</p>
        <hr>
        <h4>Side-by-side comparison</h4>
    `;

    document.getElementById("originalText").innerHTML = origHTML;
    document.getElementById("typedText").innerHTML = userHTML;

    // make download mistakes summary (optional)
    // prepare mistakes text for download if you want to implement a PDF or text download later
    window.lastAnalysis = { totalRefWords, totalErrors, subs, dels, ins, alignedRef, alignedUser, ops };

    // helper: escape HTML
    function escapeHtml(s) {
        return (s+'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
}
