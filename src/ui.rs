use std::str::FromStr;
use tiny_http::{Header, Response, Server};

pub fn webui_run(addr: &str) {
    let server = Server::http(addr).unwrap();

    for request in server.incoming_requests() {
        println!(
            "received request! method: {:?}, url: {:?}",
            request.method(),
            request.url()
        );

        let response = Response::from_string(include_str!("ui.html"))
            .with_header(Header::from_str("content-type:text/html;charset=utf-8").unwrap());
        request.respond(response).unwrap();
    }
}
