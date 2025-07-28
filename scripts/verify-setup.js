#!/usr/bin/env node

/**
 * LeepiAI Setup Verification Script
 * 
 * This script verifies that all dependencies and services are properly installed
 * and configured for the LeepiAI Interview Recorder application.
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 LeepiAI Interview Recorder - Setup Verification\n');

class SetupVerifier {
  constructor() {
    this.checks = [];
    this.passed = 0;
    this.failed = 0;
  }

  async runAllChecks() {
    console.log('Running setup verification checks...\n');

    await this.checkNodeJS();
    await this.checkPython();
    await this.checkNpmDependencies();
    await this.checkOpenAIAPI();
    await this.checkAudioDependencies();
    await this.checkEnvironmentFile();
    await this.checkMongoDBConnection();
    await this.checkGeminiAPI();

    this.printSummary();
  }

  async checkNodeJS() {
    return this.runCheck('Node.js', async () => {
      const version = process.version;
      const majorVersion = parseInt(version.slice(1).split('.')[0]);
      
      if (majorVersion < 16) {
        throw new Error(`Node.js version ${version} is too old. Minimum required: v16.0.0`);
      }
      
      return `✅ Node.js ${version} (✓ meets minimum requirement)`;
    });
  }

  async checkPython() {
    return this.runCheck('Python', async () => {
      return new Promise((resolve, reject) => {
        exec('python3 --version', (error, stdout, stderr) => {
          if (error) {
            exec('python --version', (error2, stdout2, stderr2) => {
              if (error2) {
                reject(new Error('Python not found. Please install Python 3.8+'));
              } else {
                const version = stdout2.trim();
                resolve(`✅ ${version} (using 'python' command)`);
              }
            });
          } else {
            const version = stdout.trim();
            resolve(`✅ ${version} (using 'python3' command)`);
          }
        });
      });
    });
  }

  async checkNpmDependencies() {
    return this.runCheck('NPM Dependencies', async () => {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const nodeModulesExists = fs.existsSync('node_modules');
      
      if (!nodeModulesExists) {
        throw new Error('node_modules folder not found. Run: npm install');
      }

      // Check for key dependencies
      const keyDeps = ['electron', 'react', 'openai', '@google/generative-ai', 'mongoose'];
      const missing = [];
      
      for (const dep of keyDeps) {
        const depPath = path.join('node_modules', dep);
        if (!fs.existsSync(depPath)) {
          missing.push(dep);
        }
      }
      
      if (missing.length > 0) {
        throw new Error(`Missing dependencies: ${missing.join(', ')}. Run: npm install`);
      }
      
      return `✅ All key dependencies installed (${keyDeps.length} checked)`;
    });
  }

  async checkOpenAIAPI() {
    return this.runCheck('OpenAI API', async () => {
      if (!fs.existsSync('.env')) {
        return '⚠️ Skipped - .env file not found';
      }
      
      require('dotenv').config();
      const apiKey = process.env.OPENAI_API_KEY;
      
      if (!apiKey || apiKey.includes('your-openai')) {
        return '⚠️ OpenAI API key not configured in .env file';
      }
      
      try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey });
        
        // Test API connection with a simple request
        await openai.models.list();
        
        return '✅ OpenAI API connection successful';
      } catch (error) {
        return `⚠️ OpenAI API test failed: ${error.message}`;
      }
    });
  }

  async checkAudioDependencies() {
    return this.runCheck('Audio Dependencies', async () => {
      const platform = process.platform;
      const results = [];
      
      if (platform === 'darwin') {
        // Check for SoX on macOS
        try {
          await this.execPromise('which sox');
          results.push('✅ SoX found');
        } catch {
          results.push('⚠️ SoX not found. Install: brew install sox');
        }
      } else if (platform === 'win32') {
        // Check for FFmpeg on Windows
        try {
          await this.execPromise('where ffmpeg');
          results.push('✅ FFmpeg found');
        } catch {
          results.push('⚠️ FFmpeg not found. Download from https://ffmpeg.org/download.html');
        }
      } else {
        // Check for FFmpeg on Linux
        try {
          await this.execPromise('which ffmpeg');
          results.push('✅ FFmpeg found');
        } catch {
          results.push('⚠️ FFmpeg not found. Install: sudo apt-get install ffmpeg');
        }
      }
      
      return results.join('\n    ');
    });
  }

  async checkEnvironmentFile() {
    return this.runCheck('Environment Configuration', async () => {
      const envExists = fs.existsSync('.env');
      
      if (!envExists) {
        throw new Error('.env file not found. Create one with required variables.');
      }
      
      const envContent = fs.readFileSync('.env', 'utf8');
      const requiredVars = ['MONGODB_URI', 'JWT_SECRET', 'GEMINI_API_KEY', 'OPENAI_API_KEY'];
      const missing = [];
      
      for (const varName of requiredVars) {
        if (!envContent.includes(varName + '=') || envContent.includes(varName + '=your-')) {
          missing.push(varName);
        }
      }
      
      if (missing.length > 0) {
        return `⚠️ Environment variables need configuration: ${missing.join(', ')}`;
      }
      
      return `✅ All required environment variables configured`;
    });
  }

  async checkMongoDBConnection() {
    return this.runCheck('MongoDB Connection', async () => {
      if (!fs.existsSync('.env')) {
        return '⚠️ Skipped - .env file not found';
      }
      
      require('dotenv').config();
      const mongoUri = process.env.MONGODB_URI;
      
      if (!mongoUri || mongoUri.includes('your-mongodb')) {
        return '⚠️ MongoDB URI not configured in .env file';
      }
      
      try {
        const mongoose = require('mongoose');
        await mongoose.connect(mongoUri, { 
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 5000
        });
        await mongoose.disconnect();
        return '✅ MongoDB connection successful';
      } catch (error) {
        return `⚠️ MongoDB connection failed: ${error.message}`;
      }
    });
  }

  async checkGeminiAPI() {
    return this.runCheck('Gemini AI API', async () => {
      if (!fs.existsSync('.env')) {
        return '⚠️ Skipped - .env file not found';
      }
      
      require('dotenv').config();
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey || apiKey.includes('your-gemini')) {
        return '⚠️ Gemini API key not configured in .env file';
      }
      
      try {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        
        // Test with a simple prompt
        const result = await model.generateContent('Hello');
        const response = await result.response;
        
        if (response.text()) {
          return '✅ Gemini API connection successful';
        } else {
          return '⚠️ Gemini API responded but with empty content';
        }
      } catch (error) {
        return `⚠️ Gemini API test failed: ${error.message}`;
      }
    });
  }

  async runCheck(name, checkFunction) {
    try {
      const result = await checkFunction();
      console.log(`${name.padEnd(25)} ${result}`);
      this.passed++;
      return true;
    } catch (error) {
      console.log(`${name.padEnd(25)} ❌ ${error.message}`);
      this.failed++;
      return false;
    }
  }

  execPromise(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(stdout.trim());
      });
    });
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('Setup Verification Summary');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    
    if (this.failed === 0) {
      console.log('\n🎉 All checks passed! Your setup is ready.');
      console.log('\nNext steps:');
      console.log('  1. Run: npm run dev');
      console.log('  2. Create an account and test recording');
    } else {
      console.log('\n⚠️  Some checks failed. Please fix the issues above.');
      console.log('\nCommon solutions:');
      console.log('  • Run: npm install');
      console.log('  • Run: npm run setup-whisper');
      console.log('  • Create and configure .env file');
      console.log('  • Install platform audio dependencies');
    }
    
    console.log('\nFor detailed setup instructions, see: SETUP.md');
    console.log('='.repeat(60));
  }
}

// Run the verification
const verifier = new SetupVerifier();
verifier.runAllChecks().catch(error => {
  console.error('❌ Verification script failed:', error);
  process.exit(1);
}); 