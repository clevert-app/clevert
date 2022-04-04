use std::str::FromStr;
use tiny_http::{Header, Response, Server};

pub fn run(addr: &str) {
    let server = Server::http(addr).unwrap();
    println!("gui::run()");
    for request in server.incoming_requests() {
        println!(
            "received request! method: {:?}, url: {:?}",
            request.method(),
            request.url()
        );

        let response = Response::from_string(include_str!("gui.html"))
            .with_header(Header::from_str("content-type:text/html;charset=utf-8").unwrap());
        request.respond(response).unwrap();
    }
}
