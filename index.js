const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { v4: uuid } = require('uuid');
const cors = require('cors');

const app = express();
const port = 8000;

app.use(express.json());
app.use(cors());

const dirCodes = path.join(process.cwd(), 'codes');
const dirInputs = path.join(process.cwd(), 'inputs');
const outputPath = path.join(process.cwd(), 'outputs');

if (!fs.existsSync(dirCodes)) {
    fs.mkdirSync(dirCodes, { recursive: true });
}

if (!fs.existsSync(dirInputs)) {
    fs.mkdirSync(dirInputs, { recursive: true });
}

if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
}

const generateFile = async (format, content) => {
    const jobID = uuid();
    let filename = `${jobID}.${format}`;
    if (format === 'java') {
        filename = 'Main.java';
    }
    const filePath = path.join(dirCodes, filename);
    await fs.promises.writeFile(filePath, content);
    return filePath;
};

const generateInputFile = async (input) => {
    const jobID = uuid();
    const filename = `${jobID}.txt`;
    const filePath = path.join(dirInputs, filename);
    await fs.promises.writeFile(filePath, input);
    return filePath;
};

const executeCode = (language, filepath, inputPath) => {
    const jobId = path.basename(filepath).split('.')[0];
    const outPath = path.join(outputPath, jobId);
    let command = '';
    switch (language) {
        case 'cpp':
        case 'c':
            command = `g++ ${filepath} -o ${outPath}.exe && ${outPath}.exe < ${inputPath}`;
            break;
        case 'java':
            command = `javac ${filepath} && java -cp ${dirCodes} Main < ${inputPath}`;
            break;
        case 'py':
            command = `python ${filepath} < ${inputPath}`;
            break;
        case 'js':
            command = `node ${filepath} < ${inputPath}`;
            break;
        default:
            throw new Error('Unsupported language');
    }

    const errorRegexes = {
        cpp: /\.cpp:(\d+:\d+: .*)/,
        c: /\.c:(\d+:\d+: .*)/,
        java: /Error: ([^\n\r]*)/,
        py: /SyntaxError: ([^\r\n]*)/,
        js: /codes\\24821276-3d92-4029-b6ec-1a19d64925e1\.js:\d+\r?\n([\s\S]*)/
    };

    return new Promise((resolve, reject) => {
        exec(command, { timeout: 8000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error || stderr) {
                const regex = errorRegexes[language];
                const errorMessage = regex ? (stderr.match(regex) || [stderr])[0] : stderr || error.message;
                reject(errorMessage);
            } else {
                resolve(stdout);
            }
        });
    });
};

const executeAndCompare = async (language, code, testCases) => {
    // console.log(`Executing code for ${language}...`);
    const results = [];
    const filePath = await generateFile(language, code);
    for (const testCase of testCases) {
        const inputFilePath = await generateInputFile(testCase.input.replace(/,/g, '\n'));
        try {
            const actualOutput = await executeCode(language, filePath, inputFilePath);
            // console.log("actualOutput",actualOutput);
            const passed = actualOutput.trim() === testCase.expectedOutput.trim();
            results.push({ language: language, passed });
        } catch (error) {
            results.push({ language: language, passed: false });
        }
    }

    return results;
};

app.get("/", (req, res) => {
    return res.status(200).json({
        success: true,
        message: "API is running"
    });
});

app.post('/execute', async (req, res) => {
    const { language = 'cpp', code, problemId } = req.body;
    if (!code) {
        return res.status(400).json({
            success: false,
            message: "Empty code!",
        });
    }

    try {
        const extension = {
            cpp: 'cpp',
            py: 'py',
            java: 'java',
            js: 'js',
            c: 'c'
        };

        const fileExtension = extension[language];
        if (!fileExtension) {
            return res.status(400).json({
                success: false,
                message: "Unsupported language!",
            });
        }

        const testCasesRawData = await fetch(`https://oj-sigma.vercel.app/api/getproblembyid/${problemId}`).then(res => res.json());
        const data = testCasesRawData.data.testCases;

        // console.log("data",data  );
        const transformedTestCases = data.map((testCase) => {
            const input = testCase.input;
            const expectedOutput = testCase.output;
            return { input, expectedOutput };
        });
        // console.log("transformedTestCases",transformedTestCases);
        const results = await executeAndCompare(language, code, transformedTestCases);
        // console.log("results", results);
        return res.status(200).json({
            success: true,
            results,
            message: "Code executed successfully"
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
