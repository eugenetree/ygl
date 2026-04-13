#!/bin/sh

shutdown() {
  echo "SIGTERM received, waiting for processes to finish..."
  pkill -SIGTERM -f "node dist/src/main" 2>/dev/null || true
  while pgrep -f "node dist/src/main" > /dev/null 2>&1; do
    sleep 0.5
  done
  echo "All processes stopped."
  exit 0
}

trap shutdown SIGTERM INT

# Keep container alive in a signal-interruptible way
while true; do
  sleep 86400 &
  wait $!
done
