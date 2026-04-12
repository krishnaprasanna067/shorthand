// GET URL PARAMS
let url = new URLSearchParams(window.location.search);
let vol = url.get("volume");
let pas = url.get("passage");

if (vol && pas) {
    document.getElementById("titleHead").innerText =
        `Volume ${vol} - Passage ${pas}`;
}

// AUDIO FUNCTIONS
function playAudio(speed) {
    let audio = document.getElementById("audioPlayer");
    audio.src = `p${pas}_${speed}.mp3`;
    audio.play();
}

function pauseAudio() {
    document.getElementById("audioPlayer").pause();
}

// --------------------
// EDIT DISTANCE ALIGNMENT
// --------------------
function computeEditAlignment(refWords, userWords) {
    const n = refWords.length;
    const m = userWords.length;

    const dp = Array.from({length: n+1}, () => Array(m+1).fill(0));
    const bt = Array.from({length: n+1}, () => Array(m+1).fill(null));

    for (let i=1;i<=n;i++){ dp[i][0] = i; bt[i][0] = 'del'; }
    for (let j=1;j<=m;j++){ dp[0][j] = j; bt[0][j] = 'ins'; }

    for (let i=1;i<=n;i++){
        for (let j=1;j<=m;j++){
            const costSub = (refWords[i-1].toLowerCase() === userWords[j-1].toLowerCase()) ? 0 : 1;

            dp[i][j] = dp[i-1][j-1] + costSub;
            bt[i][j] = (costSub===0) ? 'eq' : 'sub';

            if (dp[i-1][j] + 1 < dp[i][j]) {
                dp[i][j] = dp[i-1][j] + 1;
                bt[i][j] = 'del';
            }

            if (dp[i][j-1] + 1 < dp[i][j]) {
                dp[i][j] = dp[i][j-1] + 1;
                bt[i][j] = 'ins';
            }
        }
    }

    let i = n, j = m;
    const alignedRef = [];
    const alignedUser = [];
    const ops = [];

    while (i>0 || j>0) {
        const op = bt[i][j];
        if (!op) break;

        if (op === 'eq' || op === 'sub') {
            alignedRef.unshift(refWords[i-1]);
            alignedUser.unshift(userWords[j-1]);
            ops.unshift(op);
            i--; j--;
        }
        else if (op === 'del') {
            alignedRef.unshift(refWords[i-1]);
            alignedUser.unshift('');
            ops.unshift('del');
            i--;
        }
        else if (op === 'ins') {
            alignedRef.unshift('');
            alignedUser.unshift(userWords[j-1]);
            ops.unshift('ins');
            j--;
        }
    }

    return { distance: dp[n][m], ops, alignedRef, alignedUser };
}

// --------------------
// MAIN ANALYSIS FUNCTION
// --------------------
async function analyseText() {
    const f = document.getElementById("inputFile").files[0];
    if (!f) return alert("Choose a .txt file first.");

    const userText = await f.text();

    let originalText;
    try {
        const resp = await fetch(`p${pas}.txt`);
        if (!resp.ok) throw new Error("Original passage file not found");
        originalText = await resp.text();
    } catch (err) {
        document.getElementById("result").innerHTML =
            `<p style="color:red">Error: ${err.message}</p>`;
        return;
    }

    // CLEAN TEXT
    const clean = s =>
        s.replace(/[“”‘’„"(){}[\],;:?<>!]/g, '')
         .replace(/\s+/g, ' ')
         .trim();

    const refWords = clean(originalText).split(/\s+/);
    const userWords = clean(userText).split(/\s+/);

    const { ops, alignedRef, alignedUser } =
        computeEditAlignment(refWords, userWords);

    // ERROR COUNTERS
    let subs = 0, dels = 0, ins = 0, caps = 0;

    let origHTML = "";
    let userHTML = "";

    for (let i = 0; i < alignedRef.length; i++) {
        const op = ops[i];
        const r = alignedRef[i] || "";
        const u = alignedUser[i] || "";

        // CORRECT / CAPITALISATION
        if (op === "eq") {
            if (r !== u) {
                caps += 0.5;
                origHTML += `<span style="background:#cce5ff">${r}</span> `;
                userHTML += `<span style="background:#cce5ff">${u}</span> `;
            } else {
                origHTML += `<span>${r}</span> `;
                userHTML += `<span>${u}</span> `;
            }
        }

        // SUBSTITUTION (wrong word)
        else if (op === "sub") {
            subs++;
            origHTML += `<span style="background:#ffcccc">${r}</span> `;
            userHTML += `<span style="background:#ffcccc">${u}</span> `;
        }

        // DELETION (missing word)
        else if (op === "del") {
            dels++;
            origHTML += `<span style="background:#ff6666">${r}</span> `;
            userHTML += `<span style="color:#999">—</span> `;
        }

        // INSERTION (extra word)
        else if (op === "ins") {
            ins++;
            origHTML += `<span style="color:#999">—</span> `;
            userHTML += `<span style="background:#ffcc99">${u}</span> `;
        }
    }

    // FINAL SCORE
    const totalErrors = subs + dels + ins + caps;
    const totalRefWords = refWords.length;
    const errorPercent = ((totalErrors / totalRefWords) * 100).toFixed(2);

    // DISPLAY RESULTS
    document.getElementById("result").innerHTML = `
        <h3><b>Analysis Result</b></h3>
        <p><b>Total Words:</b> ${totalRefWords}</p>
        <p><b>Wrong Words:</b> ${subs}</p>
        <p><b>Missing Words:</b> ${dels}</p>
        <p><b>Extra Words:</b> ${ins}</p>
        <p><b>Capital Errors:</b> ${caps}</p>
        <p><b>Total Errors:</b> ${totalErrors}</p>
        <p><b>Error %:</b> ${errorPercent}%</p>
        <hr>
        <h4>Comparison</h4>
    `;

    document.getElementById("originalText").innerHTML = origHTML;
    document.getElementById("typedText").innerHTML = userHTML;

    window.lastAnalysis = {
        totalRefWords, totalErrors, subs, dels, ins, alignedRef, alignedUser, ops
    };
}
