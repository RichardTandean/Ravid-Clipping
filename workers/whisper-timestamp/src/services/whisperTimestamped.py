#!/usr/bin/env python3
"""
Whisper Timestamped Integration for Node.js Backend
Uses whisper-timestamped library for precise word-level timestamps
"""

import sys
import json
import os
import tempfile
import argparse
import whisper_timestamped as whisper
import torch

def setup_vad():
    """Setup Voice Activity Detection with appropriate fallbacks"""
    try:
        print("Setting up VAD...", file=sys.stderr, flush=True)
        
        # Set local directory for models
        torch.hub.set_dir('./models/torch_hub')
        
        # Explicitly trust the silero repo
        torch.hub._validate_not_a_forked_repo = lambda a, b, c: True
        torch.hub.load("snakers4/silero-vad", "silero_vad", trust_repo=True)
        
        print("VAD setup successful!", file=sys.stderr, flush=True)
        return "silero"
    except Exception as e:
        print(f"VAD setup failed, using auditok fallback: {str(e)}", file=sys.stderr, flush=True)
        return "auditok"

def download_model(model_name):
    """Download and verify Whisper model"""
    try:
        print(f"Downloading model: {model_name}...", file=sys.stderr, flush=True)
        # Force re-download by clearing cache
        cache_dir = os.path.expanduser("~/.cache/whisper")
        model_path = os.path.join(cache_dir, f"{model_name}.pt")
        if os.path.exists(model_path):
            os.remove(model_path)
        
        # Download model
        model = whisper.load_model(model_name)
        print("Model downloaded successfully!", file=sys.stderr, flush=True)
        return model
    except Exception as e:
        print(f"Error downloading model: {str(e)}", file=sys.stderr, flush=True)
        raise

def transcribe_with_word_timestamps(audio_path, model_size="base", language=None, vad=False):
    """
    Transcribe audio file with precise word-level timestamps using whisper-timestamped
    
    Args:
        audio_path (str): Path to the audio file
        model_size (str): Whisper model size (tiny, base, small, medium, large)
        language (str): Language code (auto-detect if None)
        vad (bool): Use Voice Activity Detection for better accuracy (disabled by default)
    
    Returns:
        dict: Transcription result with word-level timestamps
    """
    try:
        # Load model with retries
        max_retries = 2
        model = None
        for attempt in range(max_retries):
            try:
                print(f"Loading Whisper model (attempt {attempt + 1}/{max_retries})...", 
                      file=sys.stderr, flush=True)
                model = whisper.load_model(model_size)
                break
            except Exception as e:
                if "checksum" in str(e).lower() or attempt == max_retries - 1:
                    print("Model checksum failed, re-downloading...", file=sys.stderr, flush=True)
                    model = download_model(model_size)
                    break
                else:
                    print(f"Load attempt {attempt + 1} failed, retrying...", 
                          file=sys.stderr, flush=True)
        
        if not model:
            raise Exception("Failed to load model after multiple attempts")
        
        print("Model loaded successfully!", file=sys.stderr, flush=True)
        
        # Set transcription options
        transcribe_options = {
            "verbose": None,  # Disable verbose output
            "detect_disfluencies": True,
        }
        
        # Only enable VAD if explicitly requested
        if vad:
            vad_type = setup_vad()
            if vad_type:
                transcribe_options["vad"] = vad_type
        
        if language and language != "auto":
            transcribe_options["language"] = language
        
        # Transcribe with word-level timestamps
        print("Starting transcription...", file=sys.stderr, flush=True)
        result = whisper.transcribe(model, audio_path, **transcribe_options)
        print("Transcription completed!", file=sys.stderr, flush=True)
        
        # Transform result to match our expected format
        transformed_result = {
            "text": result["text"],
            "segments": [],
            "words": [],
            "language": result.get("language", "unknown")
        }
        
        # Process segments and extract words
        for segment in result["segments"]:
            segment_data = {
                "id": segment["id"],
                "start": segment["start"],
                "end": segment["end"],
                "text": segment["text"],
                "words": []
            }
            
            # Extract words with precise timestamps
            if "words" in segment:
                for word_info in segment["words"]:
                    word_data = {
                        "word": word_info["text"],
                        "start": word_info["start"],
                        "end": word_info["end"],
                        "confidence": word_info.get("confidence", 0.9)
                    }
                    segment_data["words"].append(word_data)
                    transformed_result["words"].append(word_data)
            
            transformed_result["segments"].append(segment_data)
        
        return {
            "success": True,
            "result": transformed_result
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def test_installation():
    """Test if whisper-timestamped is properly installed"""
    try:
        print("Testing whisper-timestamped installation...", file=sys.stderr, flush=True)
        
        # Try to import and load a small model
        import whisper_timestamped as whisper
        model = whisper.load_model("tiny")
        
        print("Installation test successful!", file=sys.stderr, flush=True)
        return {
            "success": True,
            "message": "whisper-timestamped is properly installed"
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def main():
    parser = argparse.ArgumentParser(description="Whisper Timestamped Transcription")
    parser.add_argument("audio_path", nargs='?', help="Path to audio file")
    parser.add_argument("--model", default="base", help="Whisper model size")
    parser.add_argument("--language", default=None, help="Language code (auto-detect if not specified)")
    parser.add_argument("--no-vad", action="store_true", help="Disable Voice Activity Detection")
    parser.add_argument("--output", help="Output JSON file path")
    parser.add_argument("--test", action="store_true", help="Test installation only")
    
    args = parser.parse_args()
    
    # Handle test mode
    if args.test:
        result = test_installation()
    elif not args.audio_path:
        result = {
            "success": False,
            "error": "No audio file provided. Use --test to test installation or provide an audio file path."
        }
    else:
        # Check if audio file exists
        if not os.path.exists(args.audio_path):
            result = {
                "success": False,
                "error": f"Audio file not found: {args.audio_path}"
            }
        else:
            # Transcribe with word timestamps
            result = transcribe_with_word_timestamps(
                audio_path=args.audio_path,
                model_size=args.model,
                language=args.language,
                vad=not args.no_vad
            )
    
    # Output result
    json_output = json.dumps(result, indent=2)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(json_output)
    else:
        print(json_output)

if __name__ == "__main__":
    main() 