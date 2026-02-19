// This runs automatically when the page loads
document.addEventListener("DOMContentLoaded", () => {
    getUserLocation();
});

function getUserLocation() {
    const statusDiv = document.getElementById("status");
    const resultsDiv = document.getElementById("results");

    if (!("geolocation" in navigator)) {
        statusDiv.textContent = "Geolocation is not supported by your browser.";
        return;
    }

    statusDiv.textContent = "Locating...";

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            
            statusDiv.textContent = `Location found: ${lat.toFixed(4)}, ${lon.toFixed(4)}. Fetching Air Quality...`;
            
            // Send to Python Backend
            fetchAirQuality(lat, lon);
        },
        (error) => {
            statusDiv.textContent = "Unable to retrieve your location. " + error.message;
        }
    );
}

async function fetchAirQuality(lat, lon) {
    const resultsDiv = document.getElementById("results");
    
    try {
        // We are sending data to the FastAPI server running on port 8000
        const response = await fetch("http://127.0.0.1:8000/api/get-air-quality", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ lat: lat, lon: lon }),
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();
        
        // Display the data beautifully in the <pre> tag
        resultsDiv.textContent = JSON.stringify(data, null, 2);
        document.getElementById("status").textContent = "Data loaded successfully!";

    } catch (error) {
        console.error("Error:", error);
        resultsDiv.textContent = "Error fetching data from backend.";
    }
}