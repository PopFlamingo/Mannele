import axios from "axios";

// Create a CTSRequestsCacher class
export class CTSRequestsCacher {
    // Declare a dictionary property
    // The key is the request URL
    //
    // The value contains multiple elements:
    // When the request was last sent (Date)
    // The response data from the server
    private requests: { [key: string]: { lastSent: Date, response: any } } = {};

    // Store the request token
    private requestToken: string;

    // Create a constructor that takes a request token
    constructor(requestToken: string) {
        // Store the request token
        this.requestToken = requestToken;
    }

    // Create a method to send a request
    // The method is async, takes a request URL and return the response data
    public async sendRequest(url: string): Promise<any> {
        // First we check if the request is already in the dictionary
        // If it is we check if it was made less than 30 seconds ago
        // If it is we return the response from the dictionary
        if (this.requests[url] && this.requests[url].lastSent.getTime() + 30000 > Date.now()) {
            return this.requests[url].response;
        } else {
            let authValue = `${this.requestToken}:`;
            authValue = Buffer.from(authValue).toString('base64');
            
            // Use axios to send the request, using authValue as
            // out Basic Authorization header
            let response = await axios.get(url, {
                headers: {
                    'Authorization': `Basic ${authValue}`
                }
            });

            // Store the response in the dictionary
            this.requests[url] = {
                lastSent: new Date(),
                response: response.data
            };

            return response.data;

        }
    }
}
