+++
title = "The Rusty path to Secure Metrics in Ambient Mesh"
date = 2025-05-23
description = "Building secure metrics for Istio Ambient Mesh ztunnel in Rust during an LFX internship, and what that taught me about service meshes."

[taxonomies]
tags = ["istio", "rust", "service-mesh", "cncf"]
+++

[Istio](https://istio.io/) is widely recognized as the most popular, powerful, and trusted [service mesh](https://www.solo.io/topics/service-mesh/service-mesh-architecture) in the cloud native ecosystem and is [extensively used in Production since it's inception](https://youtu.be/cV6JFq8XNZQ?si=wmSUz605Dl4km4Az). Fortunately, I got the opportunity to intern at Istio (managed CNCF and spun out of Google), and man my brain transitioned from a code-monkey to a divine architect in mere span of 3 months. 

## What did I do?

*It feels surreal to know that the work I did during my internship will have a outsized impact on everyone using Istio's ztunnel. Imagine, everytime someone scrapes ztunnel, they use one feature designed and implemented by me. Wowwwwww....*

Before my work, ztunnel metrics were exposed in plaintext, trusting any client that could reach the port - scraping metrics followed `Prometheus -> HTTP -> Ztunnel Metrics Server` :
* Direct HTTP connection
* No encryption
* No authentication
* No policy enforcement
* Simple but insecure

I added support for TLS (mTLS via HBONE tunneling) in the [metrics endpoint in the ztunnel in Shared Proxy Mode of Istio's Ambient Dataplane Mode](https://github.com/istio/ztunnel?tab=readme-ov-file#metrics). Lots of buzzwords right ( ՞۝՞)

Initially, I naively thought the solution would be straightforward - add a new mTLS-enabled metrics server to ztunnel. This seemed logical - we need secure metrics, so let's add TLS. I started implementing a separate server that would:
* Listen on a dedicated port
* Handle TLS/mTLS directly
* Serve metrics over the secure connection

However, this approach had significant drawbacks:
* It would bypass ztunnel's existing inbound logic
* It would require duplicating certificate management code
* It would create a separate security model from the rest of the mesh
* And, most importantly, it would break the transparency principle - *Prometheus would need to be configured specifically for mTLS*

After I made a draft PR implementing the new mTLS-metrics server, then I realized that I should take a break and actually think a lot more. The feedback from Istio community was great, and helped me grasp the context and the sheer scale of the system that I was working on. 

Service mesh should provide **zero-trust security** by default - where no service is trusted until proven otherwise, provides security and observability without requiring changes to the application code, provides a consistent security model across all services in the mesh, treats all services uniformly acting as platform for consistent service-to-service communication, allowing progressive enhancement of service capabilities.

The "aha moment" came when I realized that ztunnel itself could be treated as a workload in the mesh, so I can extend the service mesh to include ztunnel itself. This was a profound insight because:
* It aligned with Istio's "everything is a workload" philosophy
* It meant we could leverage existing mesh capabilities rather than building new ones
* It maintained transparency for both ztunnel and Prometheus

Now, now its `Prometheus -> HTTP -> Local Ztunnel -> HBONE -> Target Ztunnel -> Metrics Server` :
* Prometheus still makes a plain HTTP request (transparency - dosen't need to know about TLS or HBONE)
* The request is intercepted by iptables rules on the node where Prometheus is running (local ztunnel on the same node)
* Ztunnel recognizes this is a request to another Ztunnel pod (target ztunnel being scraped) in the mesh
* It automatically upgrades the connection to HBONE (HTTP/2 over mTLS)
* This happens transparently to Prometheus - it's still just making a regular HTTP request
* Target ztunnel processes through standard inbound path, forwarding to internal metrics server, sending back through same tunnel
* Full Network Policy enforcement
* Secure but transparent to both ends

Every metrics request must prove its identity through mTLS, and authorization policies can control exactly which Prometheus instances can access the metrics

The key components that made this possible is :
* *Ambient Redirection* - The `ambient.istio.io/redirection: enabled` label on ztunnel pods tells the mesh that ztunnel should be treated as a workload and enables automatic traffic interception and HBONE upgrade.
* *Identity Management* - Ztunnel uses Kubernetes Downward API to get its identity which is used to request certificates from Istiod. Same process as any other workload in the mesh.
* *Inbound Handler* - Existing component that already handles HBONE connectionsa and processes mTLS termination.

No new code needed! Elegant...

> Fun thing - I increased the ztunnel binary size form 15mb to 16mb, which lead to CI failure. I had a fun time watching my mentor figure out what the heck just happened in Weekly Standup ( ^^)Y

Now for a deeper look you can take a look at the [Design Doc](https://docs.google.com/document/d/19vMr22inhLAPjWcVJkZWiG_GY6ZG3PLxG9QqAmIlnIc/edit?usp=sharing) for the feature. Most of my time went into thinking about the design, instead of coding it up. I also created a [beautiful Internship report](https://docs.google.com/document/d/1-TFA0FnmHgsL0IOFIn8Vm5_klDFZkAqg31oX1-p88Pw/edit?usp=sharing).  

## What did I learn?

Due to my prior internship experience in Rust, the compiler was very friendly with me this time ■D＼(^^ )

This time, I learnt a lot of Kubernetes, Helm, low-level TCP/IP, HTTP/S, certificate management, debugging docker containers in different namespaces in k8s clusters, about service mesh and why they are adopted at the first place, and more.

[Learning Service Mesh](https://youtu.be/rVNPnHeGYBE?si=zVFql6-qTD_tn1qI) was very daunting for a new-comer like me! So many new terminology gets thrown here and there! This [tutorial](https://www.youtube.com/watch?v=KUHzxTCe5Uc) on Istio's Service Mesh helped me grasp things quite well! [Life of a packet in Istio is very interesting](https://youtu.be/cB611FtjHcQ?si=z85aMnm2Amj-HOQ4) ヽ(o⌣oヾ)

This project taught me several valuable lessons about service mesh:
* *Transparency is the Key* - The beauty of service mesh is that applications don't need to know about security. Prometheus still makes plain HTTP requests and the Ztunnel's metrics server still serves plain HTTP. The mesh handles all the security complexity
* *Configuration Over Code* - Instead of writing new security code, we configured ztunnel to be a workload leveraging existing, well-tested components reducing complexity and potential bugs
* *Mesh Philosophy* - Understanding that service mesh is about treating everything as a workload. Even infrastructure components like ztunnel can benefit from mesh capabilities. The mesh should be the security boundary, not individual components.

What's really cool about this solution is that it demonstrates the power of service mesh architecture:
* We didn't need to modify the metrics server
* We didn't need to configure Prometheus
* We didn't need to write new security code
* We just needed to tell the mesh "hey, ztunnel is a workload too"

This is exactly why organizations adopt service mesh - it provides security and observability without changing applications which stay simple and focused on core functionality. No need for applications to implement complex security protocols. The fact that we could extend this to ztunnel itself shows how powerful and flexible the architecture is.

So, I told the tale of my internship, but if you want to learn more, you can read further about the ztunnel internals....

## But what's Ztunnel? 

Ztunnel (Zero Trust Tunnel) is a core component of [Istio Ambient Mesh](https://istio.io/latest/blog/2022/introducing-ambient-mesh/). It acts as a secure transport proxy running on each node. Its main job is to handle traffic redirection and establish secure [HBONE tunnels](https://istio.io/latest/docs/ambient/architecture/hbone/) between different pods using mutual TLS (mTLS) based on workload identities - [SPIFFE](https://www.solo.io/blog/understanding-istio-ambient-ztunnel-and-secure-overlay). It manages traffic without requiring traditional sidecars for every application pod, receiving configuration dynamically from the Istio control plane (Istiod) via [xDS](https://www.envoyproxy.io/docs/envoy/latest/api-docs/xds_protocol). It can operate in a shared mode, serving multiple pods on a node.

Plenty of cool blogs from the cool folks at CNCF to learn more :

* [Lin Sun's](https://github.com/linsun) - [blog introducing ztunnel for Istio's Ambient Mesh](https://istio.io/latest/blog/2023/rust-based-ztunnel/)
* [Marino Wijay's](https://github.com/distributethe6ix) - [blog with cool diagrams about it](https://www.solo.io/blog/understanding-istio-ambient-ztunnel-and-secure-overlay).

Well, [the architecture is explained in short in the repository](https://github.com/istio/ztunnel/blob/master/ARCHITECTURE.md), but that's just too less information for me. So, as I already intended to deep-dive into the ztunnel codebase, I am writing about it.

## Understanding its Architecture 

The most fundamental job of ztunnel is [Traffic Interception & Routing](https://tetrate.io/blog/transparent-traffic-interception-in-istio-ambient-mode-a-comprehensive-explanation/?utm_content=318241177&utm_medium=social&utm_source=twitter&hss_channel=tw-998918265177952259).

On Linux, [orig_dst_addr](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/socket.rs#L61) uses the [getsockopt system call](https://man7.org/linux/man-pages/man2/setsockopt.2.html) with IPv4/v6 socket options. These options allow a program to retrieve the original destination address of a connection that was redirected by the netfilter framework (using [iptables with REDIRECT](https://youtu.be/NAdJojxENEU?si=lySWydWtqlO83x7m) or [TPROXY](https://www.kernel.org/doc/Documentation/networking/tproxy.txt) targets).

For platforms other than Linux, ztunnel's transparent interception capabilities relying on this mechanism would be limited or would require different OS-specific approaches.

The [Config](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/config.rs#L181) struct is the single source of truth for ztunnel's runtime parameters. Once it's [constructed](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/config.rs#L418), various parts of ztunnel will refer to it to make decisions.

It has [Shared and Dedicated Proxy Modes](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/config.rs#L142) built via [ProxyFactory](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxyfactory.rs#L31) :
```
                              +-------+
                              | Start |
                              +-------+
                                  |
                                  v
                          +-------------+
                          | Which Mode? |
                          +-------------+
                         /               \
                        /                 \
                       /                   \
                 Dedicated                Shared
                    |                       |
                    v                       v
           +----------------+      +--------------+
           | Create Default |      | Get Pod's    |
           | SocketFactory  |      | NetNS        |
           +----------------+      +--------------+
                    |                       |
                    v                       v
           +----------------+      +--------------+
           | Packet Mark    |      | Create InPod |
           | Configured?    |      | SocketFactory|
           +----------------+      +--------------+
              /          \                  |
            Yes           No                v
             |            |          +--------------+
             v            |          | Port Reuse   |
     +--------------+     |          | Enabled?     |
     | Wrap with    |     |          +--------------+
     | MarkFactory  |     |             /        \
     +--------------+     |           Yes         No
             |            |            |          |
             |            |            v          |
             |            |    +--------------+   |
             |            |    | Wrap with    |   |
             |            |    | ReuseFactory |   |
             |            |    +--------------+   |
             |            |            |          |
             +------------+------------+----------+
                          |
                          v
                 +----------------------+
                 | Create LocalWorkload |
                 | Information          |
                 +----------------------+
                          |
                          v
                 +----------------------+
                 | DNS Proxy Enabled?   |
                 +----------------------+
                      /            \
                    Yes             No
                     |              |
                     v              |
         +------------------+       |
         | Create DNS Server|       |
         +------------------+       |
                     |              |
                     v              |
         +------------------+       |
         | Get Resolver     |       |
         +------------------+       |
                     |              |
                     +--------------+
                          |
                          v
                 +----------------------+
                 | Main Proxy Enabled?  |
                 +----------------------+
                      /            \
                    Yes             No
                     |              |
                     v              |
         +------------------+       |
         | Create Connection|       |
         | Manager          |       |
         +------------------+       |
                     |              |
                     v              |
         +------------------+       |
         | Create Proxy     |       |
         | Inputs           |       |
         +------------------+       |
                     |              |
                     v              |
         +------------------+       |
         | Create Proxy     |       |
         +------------------+       |
                     |              |
                     +--------------+
                          |
                          v
                 +----------------------+
                 | Return ProxyResult   |
                 +----------------------+
                          |
                          v
                         +-----+
                         | End |
                         +-----+
```

### Whats this HBONE thingy?

HBONE (HTTP-Based Overlay Network Encapsulation) is Istio specific thing which uses HTTP/2 as foundational protocol (HTTP CONNECT and standard mTLS). It creates a virtual network layer on top of the existing physical network. This "overlay" is where our secure tunnels live. It takes regular application traffic (which is usually TCP traffic) and "wraps" or "encapsulates" it inside these HTTP/2 streams.

HBONE wraps standard TCP traffic (what your applications speak) inside an HTTP/2 stream. This HTTP/2 stream is then secured using mutual TLS (mTLS). So all the traffic flowing through the HBONE tunnel (i.e., within the mTLS session) is encrypted. Eavesdroppers on the network cannot understand the data. Pod A and Pod B just use standard TCP. They are completely unaware of the mTLS and HTTP/2 encapsulation happening underneath by ztunnel.

HTTP has a CONNECT method, traditionally used for proxying. HBONE cleverly reuses this. To establish a tunnel to a target pod, the source ztunnel sends an HTTP/2 CONNECT request to the destination ztunnel.

Establishing an mTLS handshake and a new HTTP/2 connection for every single small request between two pods would be slow and inefficient. To solve this, ztunnel implements sophisticated connection pooling for HBONE connections through the [WorkloadHBONEPool](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxy/pool.rs#L50).

If an existing, healthy, mTLS-secured HTTP/2 connection to ztunnel is already in the pool and has spare capacity (HTTP/2 allows many streams on one connection), that connection is reused. A new HTTP/2 stream is created on that existing connection for the current request. The [H2ConnectClient](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxy/h2/client.rs#L36) represents an active, pooled HTTP/2 client connection to a remote ztunnel.

The pool includes sophisticated mechanisms to manage connection lifecycle : 
* [When a new connection is needed, the pool ensures that only one task creates a connection for a given destination, even if many requests arrive simultaneously](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxy/pool.rs#L204) 
* [The pool tracks how many HTTP/2 streams are active on each connection and won't exceed the configured limits](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxy/h2/client.rs#L77)
*  [Connections that aren't used for a configurable period are automatically closed to free up resources](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxy/pool.rs#L126)
* [HTTP/2 connections use PING frames to verify connection health](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxy/h2/client.rs#L195)

```
+--------------------------+
| Outbound request needs   |
| HBONE                    |
+--------------------------+
             |
             v
+--------------------------+
| Check connection pool    |
| for existing connection  |
| to destination           |
+------------+-------------+
             |
   +---------+---------+
   |                   |
   v Connection        v No Connection / At Capacity
+----------------+   +--------------------------+
| Reuse existing |   | Try to acquire lock for  |
| connection     |   | destination              |
+----------------+   +------------+-------------+
             |                    |
             |          +---------+---------+
             |          |                   |
             |          v Lock Acquired     v Lock Acquisition Failed
             |         +-----------------+  +--------------------------+
             |         | Create new mTLS |  | Wait briefly, then retry |
             |         | + HTTP/2 conn   |  | pool check (go back up)  |
             |         +-------+---------+  +------------+-------------+
             |                 |                          ^
             |                 v                          |
             |         +-----------------+                |
             |         | Add connection  |----------------+
             |         | to pool         |
             |         +-------+---------+
             |                 |
             |                 v Connection Ready
             |                 |
             +--------+--------+
                      |
                      v
             +-----------------+
             | Create new      |
             | HTTP/2 stream   |
             +-----------------+
                      |
                      v
             +-----------------+
             | Send HTTP/2     |
             | CONNECT request |
             +-----------------+
                      |
                      v
             +-----------------+
             | Wait for 200 OK |
             | response        |
             +-----------------+
                      |
                      v
             +-----------------+
             | HTTP/2 stream   |
             | ready for data  |
             +-----------------+
```

By wrapping application TCP traffic in mTLS-secured HTTP/2 streams, ztunnel provides strong authentication, encryption, and integrity for inter-pod communication, all without requiring any changes to the applications. Ztunnel transparently manages the creation, termination, and pooling of these secure tunnels.

### How does a connection work?

The `Proxy` struct orchestrates the different parts of ztunnel :
```rust
pub struct Proxy {
    inbound: Inbound, // Handles inbound HBONE traffic
    inbound_passthrough: InboundPassthrough, // Handles inbound non-HBONE TCP traffic
    outbound: Outbound, // Handles outbound traffic from local applications
    socks5: Option<Socks5>, // Optional SOCKS5 proxy support
    policy_watcher: PolicyWatcher, // Watches for policy changes
}
```

The pool tracks connection by workload key :
```rust
pub struct WorkloadKey {
    pub src_id: Identity,       // Source workload identity
    pub dst_id: Vec<Identity>,  // Destination workload identity/identities
    pub dst: SocketAddr,        // Destination address
    pub src: IpAddr,            // Source IP address
}
```

* *Outbound Traffic*: When your application pod tries to send a message to another service, ztunnel intercepts this message before it leaves the node. It decides whether the outbound traffic needs to go directly via TCP, or HBONE tunneling or through Waypoint/Gateway. The outbound's [build_request](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxy/outbound.rs#L374) handles the routing by constructing a [Request](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxy/outbound.rs#L584) with routing decisions made, and then [passed to appropriate protocol handler](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxy/outbound.rs#L152). 

* *Inbound Traffic: When a message arrives at the node destined for one of your application pods, ztunnel also intercepts this message before it reaches the pod. If its wrapped in an HBONE tunneling (meaning it came from another ztunnel or a compatible component), it decrypts the traffic, verifies the identity of sender using Workload and Certificates, and then [forwards the plaintext TCP to local pod](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxy/inbound_passthrough.rs#L66) after checking the security policies via [serve_connect method](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxy/inbound.rs#L183). When [building the inbound request](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxy/inbound.rs#L314), [validation checks](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxy/inbound.rs#L458) ensure security, after which we [determine the actual socket address to forward the traffic to](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxy/inbound.rs#L539). Before everything, TLS handshake happens [verifying server and client identities via InboundCertProvider](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxy/inbound.rs#L81). 

[ProxyState](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/inpod/admin.rs#L32) is the knowledge base that stores information about workloads and services.
[ConnectionManager](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxy/connection_manager.rs#L59) enforces policies and tracks active inbound and outbound connections. [SocketFactory](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxy.rs#L61) creates properly configured sockets for each connection type.
[PolicyWatcher](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxy/connection_manager.rs#L305) monitors for policy changes and updates the connection manager.

The flow of a connection :

```
+--------+        +--------+        +--------+        +--------+
| Pod A  |        | zt A   |        | zt B   |        | Pod B  |
| Node 1 |        | Node 1 |        | Node 2 |        | Node 2 |
+--------+        +--------+        +--------+        +--------+
    |                 |                 |                 |
    |                 |                 |                 |
    | Request to B    |                 |                 |
    |---------------->|                 |                 |
    |                 | Intercept Req   |                 |
    |                 | Analyze         |                 |
    |                 | Decide HBONE    |                 |
    |                 | Establish HBONE |                 |
    |                 | Tunnel          |                 |
    |                 |---------------------------------->| Establish HBONE
    |                 |                 |                 | Tunnel
    |                 | Encrypted Req   |                 |
    |                 |---------------------------------->|
    |                 |                 |                 | Receive &
    |                 |                 |                 | Decrypt Req
    |                 |                 |                 | Verify Identity
    |                 |                 |                 | Plaintext Req
    |                 |                 |                 |---------------->|
    |                 |                 |                 |                 |
    |                 |                 |                 |                 | Process Req
    |                 |                 |                 | Plaintext Resp  |
    |                 |                 |                 |<----------------|
    |                 |                 | Encrypt Resp    |                 |
    |                 | Encrypted Resp  |<----------------|                 |
    |                 |<----------------------------------|                 |
    |                 |                 |                 |                 |
    | Decrypt Resp    |                 |                 |                 |
    | Plaintext Resp  |                 |                 |                 |
    |<----------------|                 |                 |                 |
    |                 |                 |                 |                 |
```
The data forwarding is handled via [copy_bidirectional](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/copy.rs#L142) which efficiently shuttles bytes between two connections ensuring data flows smoothly once ztunnel has decided where it should go.

### Workload Identities 

A [Workload](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/state/workload.rs#L224) in ztunnel represents an instance of your application, typically a pod in Kubernetes.

Ztunnel helps manage cryptographic identities for the workloads running on its node using [SPIFFE ID](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/identity/manager.rs#L42) - `spiffe://your-trust-domain/ns/your-namespace/sa/your-service-account`.

To prove a workload actually owns a SPIFFE ID, it gets an [X.509 certificate](https://learn.microsoft.com/en-us/azure/iot-hub/reference-x509-certificates) and [creates a CSR with the SPIFFE ID sending to Istiod over gRPC connection](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/identity/caclient.rs#L62), receiving response and [verifying the certificate](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/identity/auth.rs#L19) and returning and storing complete [Workload Certificate](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/tls/certificate.rs#L50) used for mTLS :

```
+------------------------+       +-----------------------------------+       +---------------------------------+
| Pod Alpha (Workload)   |       | ztunnel (on Pod Alpha's Node)       |       | Istiod (Certificate Authority)  |
|         (PA)           |       |                (ZT)               |       |                (ICA)            |
+------------------------+       +-----------------------------------+       +---------------------------------+
           |                                       |                                       |
           | 1. Workload Starts Up                 |                                       |
           +--------------------------------------->| [ ZT activated ]                      |
           |                                       | |                                     |
           |                                       | | 2. Determine Pod Alpha's Identity   |
           |                                       | |    (e.g., spiffe://cluster.local/   |
           |                                       | |      ns/default/sa/alpha)           |
           |                                       | |                                     |
           |                                       | | 3. Generate CSR & Private Key       | // Note: CSR contains Pod Alpha's
           |                                       | |    for Pod Alpha                    | // public key & desired identity (SAN)
           |                                       | |                                     |
           |                                       | | 4. Send CSR to Istiod               |
           |                                       | +-------------------------------------->| [ ICA activated ]
           |                                       | |                                     | |
           |                                       | |                                     | | 5. Validate CSR
           |                                       | |                                     | |    (Authenticate ztunnel,
           |                                       | |                                     | |     check policies)
           |                                       | |                                     | |
           |                                       | |                                     | | 6. Sign Certificate
           |                                       | |                                     | |    (embedding Pod Alpha's
           |                                       | |                                     | |     identity)
           |                                       | |                                     | |
           |                                       | | 7. Send Signed Certificate back     | |
           |                                       | +<--------------------------------------|
           |                                       | |                                     | [ ICA deactivated ]
           |                                       | |                                     |
           |                                       | | 8. Store Certificate & Private Key  | // Note: Certificate is now ready
           |                                       | |                                     | // for mTLS handshakes
           |                                       | [ ZT deactivated ]                    |
           |                                       |                                       |
```

Requesting a [certificate](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/identity/manager.rs#L161) from the CA for every connection would be very slow. So, ztunnel uses a SecretManager to efficiently manage and cache these certificates. The SecretManager and its supporting components:

* Keeps track of certificates for all workloads on the node.
* Handles requests to fetch certificates, possibly returning a cached one if it's still valid.
* Schedules background tasks to refresh certificates before they expire, ensuring workloads always have a valid certificate.
* Manages the concurrency of requests to the CA to avoid overwhelming it.

```
                                                    +------------------------+
                                                    | Certificate refresh    |
                                                    | timer                  |
                                                    +------------------------+
                                                             |
                                                             v
Application        +----------------+              +-----------------+
makes request ---> | SecretManager  |    No       | Certificate     |
                  | Has valid      |------------> | needs refresh?   |
                  | cached cert?   |              +-----------------+
                  +----------------+                      |
                      |                                  | Yes
                      | Yes                              v
                      |                         +------------------+
                      |                         | Queue background |
                      |                         | refresh          |
                      |                         +------------------+
                      |                                  |
                      |                                  v
                      |                         +------------------+
                      |                         | Worker checks    |
                      |                         | cert priority    |
                      |                         +------------------+
                      |                                  |
                      |                                  v
                      |                         +------------------+
                      |                         | Worker requests  |
                      |                         | cert from CA     |
                      |                         +------------------+
                      |                                  |
                      |                                  v
                      |                         +------------------+
                      |                         | CA validates and |
                      |                         | returns cert     |
                      |                         +------------------+
                      |                                  |
                      |                                  v
                      |                         +------------------+
                      |                         | Store cert in    |
                      |                         | cache           |
                      |                         +------------------+
                      |                                  |
                      |                                  v
                      |                         +------------------+
                      |<------------------------|  Notify waiting  |
                      |                         |  applications    |
                      v                         +------------------+
            +------------------+
            | Return cached    |
            | certificate      |
            +------------------+
```
Each workload certificate is proactively refreshed halfway through its validity period, ensuring smooth operations without disruption due to expired certificates.

### xDS client

Your service mesh is not static. New application versions get deployed (new workloads), old ones are removed, services scale up or down, and security policies change. ztunnel needs to know about all these changes in real-time to make correct routing and security decisions. How is stuff of ambient mesh updated in real time?

The XDS Client in ztunnel is the component responsible for communicating with Istiod to receive these dynamic configuration updates. [ztunnel uses a specific, efficient version of XDS called Delta ADS](https://tetrate.io/blog/istio-service-mesh-delta-xds/)
* *Aggregated*: Multiple types of information (like workloads, services, policies) are sent over a single connection, which is efficient.
* *Delta*: Instead of sending the entire configuration every time something small changes, Istiod only sends the differences (deltas – what's new, what's changed, what's removed). This saves a lot of network traffic and processing time.

The [xDS Client](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/state.rs#L1038) connects to Istiod after checking `config.xds_address`, tells it what kind of information ztunnel is interested in, and then receives a stream of updates. These updates are then used to keep ztunnel's internal Proxy State Management in sync.

Once connected, the `AdsClient` [sends initial DeltaDiscoveryRequest messages](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/xds/client.rs#L374) to Istiod for each resource type it's interested in (like ADDRESS_TYPE for workloads/services and AUTHORIZATION_TYPE for policies). This request includes a Node identifier, which tells Istiod who this ztunnel is (e.g., its IP, pod name, namespace). This helps Istiod send relevant configuration. Istiod [responds with DeltaDiscoveryResponse messages](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/xds/client.rs#L682). The first response usually contains the current state for the subscribed resources. Subsequent responses contain only the changes (deltas). The [ProxyStateUpdater](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/xds.rs#L105) receives the decoded XDS resources (e.g., XdsAddress which can be a workload or service, or XdsAuthorization for policies).

[The xDS messages themselves are defined as Protocol Buffers (protobufs)](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/proto/xds.proto).

```
ztunnel (XDS Client)          Istiod (XDS Server)
        |                            |
        |                            |
        |---------------------------→|  1. Establish Secure gRPC Connection (mTLS)
        |     Uses workload ID       |
        |                            |
        |←---------------------------|  Connection Established
        |                            |
        |---------------------------→|  2. Send DeltaDiscoveryRequest
        | Subscribe to types         |
        |                            |
        |←---------------------------|  3. Send DeltaDiscoveryResponse
        |    Initial mesh state      |
        |                            |
        |            ∙               |
        |            ∙               |  Ongoing Updates Loop:
        |            ∙               |
        |                            |
        |←---------------------------|  4. Send DeltaDiscoveryResponse
        |   Workload/Policy updates  |
        |                            |
        |     /-----------------\    |  5. Process updates
        |     | Update internal |    |
        |     | ProxyState     |     |
        |     \-----------------/    |
        |                            |
        |---------------------------→|  6. Send ACK/NACK
        |    Update confirmation     |
        |                            |
        |            ∙               |
        |            ∙               |  Loop continues...
        |            ∙               |
```

For very large meshes, ztunnel might not want to receive all configuration for all workloads and services upfront. So, there is an [on-demand XDS](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/xds/client.rs#L264) feature which allows it to fetch only what it needs, when it needs it. The proxy state manager can [request specific resources when it needs them](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/state.rs#L995). The AdsClient [listens for demand requests and sends them to Istiod](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/xds/client.rs#L749). When a response containing the requested resource arrives, [ztunnel notifies the waiting component](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/xds/client.rs#L234). Even if some resources in an update fail, the valid ones are still processed.

### Proxy State Management

The heart of ztunnel's state management is [ProxyState](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/state.rs#L169) which has specilized stores - records of all individual workloads, catalogs all the services, and archives all the security policies.

The [WorklaodStore](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/state/workload.rs#L688) is optimized for efficient lookups of Workloads. The store even optimizes for the common case where a single IP maps to a single workload. This structure provides multiple indices to find workloads efficiently by:
* IP address + network
* Unique identifier (UID)
* Identity (for local workloads)

The [ServiceStore](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/state/service.rs#L332) manages information about Services. A [Service](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/state/service.rs#L37) is an abstraction for a group of workloads that together provide a certain functionality. Clients usually talk to a service's stable virtual IP (VIP) and port, and the mesh routes the request to one of the healthy backing workloads. This structure allows for extremely fast lookups of services by:
* VIP (Virtual IP address)
* Hostname
* Namespace + hostname combination

The [PolicyStore](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/state/policy.rs#L23) holds all the Authorization policies. These policies are the [RBAC rules](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/rbac.rs#L36) that dictate traffic flow. The policy store efficiently indexes policies by:

* Full key (namespace/name)
* Namespace (for quickly finding all policies in a namespace)

It also includes a notification system to alert subscribers when policies change.

While ProxyState organizes the data efficiently, accessing it directly would be cumbersome for most operations. The DemandProxyState wrapper provides higher-level functionality and serves functions :
* Concurrent access management: It safely handles the RwLock to ensure thread safety
* On-demand resource fetching: It can request resources that aren't in local cache
* Metrics tracking: It maintains metrics about state operations
* DNS resolution: It handles DNS lookups when needed

When an application pod (say, Pod A) sends a request to "Service B", ztunnel (managing Pod A) intercepts this. So, the decision for routing happens :

```
                                   +----------------+
                                   | Intercept      |
                                   | request to     |
                                   | Service B      |
                                   +----------------+
                                          |
                                          v
                                   +----------------+
                                   | Look up        |
                                   | Service B      |
                                   +----------------+
                                          |
                    +---------------------+--------------------+
                    |                     |                   |
                    | Found              Not                  |
                    v                   found                 v
         +----------------+              |            +----------------+
         | Get healthy    |              |            | Try on-demand |
         | endpoints      |              |            | fetch?        |
         +----------------+              |            +----------------+
                    |                    |                   |
                    |                    v                   |
                    |             +----------------+         | Yes
                    |             | Request        |         |
                    |             | Service B      |<--------+
                    |             | from Istiod    |
                    |             +----------------+    No   |
                    |                    |              +----+
                    |                    v              |
                    |             +----------------+    |
                    |             | Re-check       |    |
                    |             | ServiceStore   |    |
                    |             +----------------+    |
                    |                    |              |
                    |            Found   |    Not found |
                    +--------------------+              |
                            |                           |
                            v                           v
                    +----------------+         +----------------+
                    | Select endpoint|         | Fail request   |
                    | Workload C     |         +----------------+
                    +----------------+
                            |
                            v
                    +----------------+
                    | Look up        |
                    | Workload C     |
                    +----------------+
                            |
                            v
                    +----------------+
                    | Get IP, port,  |
                    | protocol info  |
                    +----------------+
                            |
                            v
                    +----------------+
                    | Has waypoint?  |
                    +----------------+
                            |
                    +-------+-------+
                    |               |
                   Yes             No
                    |               |
                    v               v
         +----------------+ +----------------+
         | Route through  | | Route directly |
         | waypoint       | | to Workload C  |
         +----------------+ +----------------+
```
### DNS Proxying 

[DNS Proxying](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/dns/server.rs#L62) in ztunnel is an [optional feature](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/proxyfactory.rs#L102) where ztunnel itself helps your applications (pods) find the IP addresses of other services. It acts as a local [DNS resolver](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/dns/server.rs#L332) and [forwarder](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/dns/server.rs#L831). This speeds up lookups for services within the mesh because ztunnel can answer directly, and it ensures consistent name resolution.

When DNS Proxying is enabled:

* *Interception*: Network rules (often iptables) on the node are set up to redirect any DNS queries (on UDP port 53) sent by your local application pods to ztunnel's DNS proxy listening port (e.g., 15053, configured by `config.dns_proxy_addr`).
* *Local Resolution Attempt*: ztunnel receives the DNS query. It first checks if the requested name belongs to a service within the mesh using its internal Proxy State Management. If it's a known mesh service (e.g., `checkout.default.svc.cluster.local`), ztunnel resolves it to the service's Virtual IP (VIP) or endpoint IPs (for headless services). It then sends a DNS response directly back to the application pod. Queries for mesh services are resolved directly from the local state, avoiding network roundtrips, making it very fast.
* *Caching*: The DNS responses include appropriate TTLs to allow client-side caching.
* *Forwarding*: If ztunnel doesn't know the name, it forwards the DNS query to the upstream DNS servers that are configured in its environment (typically [kube-dns](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/) or the node's resolvers). If a service is not found in the mesh state, the query is seamlessly forwarded to upstream DNS.
* *Relaying Response*: When the upstream DNS server responds, ztunnel relays this response back to the application pod.

With the help of DNS proxying, we get :
* *Speed*: Resolving mesh-internal service names locally is much faster than going to an external DNS server.
* *Accuracy*: ztunnel uses its live Proxy State Management data, ensuring that DNS results for mesh services reflect the current state of the mesh.
* *Consistency*: Helps ensure all pods get a consistent view of service addresses within the mesh.
* *Reduced Load on Upstream DNS*: Offloads queries for internal services from kube-dns or other central resolvers.
* *Enhanced Flexibility*: Supports both standard and headless services with appropriate IP addressing.

### Shutdown

Ztunnel constantly listens for shutdown signals. This tells the DrainTrigger to notify all DrainWatchers and then waits for them to finish with their DrainMode.

The `drain::new()` function creates the DrainTrigger and its initial DrainWatcher. This DrainWatcher can be cloned and passed to any component that needs to participate in the graceful shutdown.

### Observibility

Good observability is crucial for any service mesh component, especially one handling production traffic like ztunnel. It provides comprehensive metrics across all its core functions - traffic proxying, DNS resolution, TLS certificate handling, and more, and integrate seamlessly into Prometheus, making them easy to visualize using tools like Grafana and setup AlertManager.

When ztunnel starts up, it creates a [central Prometheus registry that will hold all metrics](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/app.rs#L79). The [metrics::sub_registry()](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/metrics.rs#L33) function creates a namespace for Istio-specific metrics to avoid conflicts with other systems. Each component (Proxy, DNS, XDS, etc.) defines its own metrics in a dedicated module. For connection-oriented operations like proxying traffic, ztunnel uses a pattern where metrics are incremented at the start of an operation and then finalized when the operation completes. 

Ztunnel [exposes its metrics through an HTTP endpoint in the Prometheus format](https://github.com/istio/ztunnel?tab=readme-ov-file#metrics) with a rich set of labels which allows you to filter and group metrics by workload, namespace, service, security policy, and more, allowing bifurcation like :
* Identifying which services generate the most traffic
* Spotting security policy violations
* Tracking error rates between specific service pairs
* Monitoring the performance impact of mesh configuration changes

There are access logs for detailed event tracking as well.
It's [profiled](https://github.com/istio/ztunnel/blob/master/PROFILING.md) and [benchmarked extensively](https://github.com/istio/ztunnel/tree/master/benches). 

### The Rusty aspect of Ztunnel

[Istio's Ambient Mesh was specifically designed for Scalability](https://youtu.be/S39yo6ZJ4iM?si=WZinWe_2riCilu4y). But Rust is not the reason Ztunnel is scalable.

You won't believe me, but the creator of ztunnel wrote it in Go, but was not satisfied with the [performance](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/benches/README.md), renamed all the files to `.rs` and with the help of the Rust compiler did a complete rewrite in Rust (◕▽◕) Crazyyyyy...

Ztunnel boasts a [dual runtime](https://users.rust-lang.org/t/one-or-multiple-runtimes-for-tokio-webserver/110149) model :

* Control Plane Runtime is the [main thread](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/main.rs#L46) which handles tasks that are essential for the proxy's management and configuration but are not directly impacting the data plane. It includes xDS client fetching configuration updates from Istiod, debug interfaces and [health checks](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/app.rs#L220) impacting the data plane. As the [Admin tasks](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/app.rs#L111) are often sequential or don't require high parallelism and requires less resources that could otherwise be used for data plane tasks, a single thread is easier to reason about and debug. Crucially, if something goes wrong in an admin task (e.g., a bug in xDS handling, a panic in a debug endpoint), it's less likely to crash or stall the entire data plane that's handling live user traffic. The user request flow remains unaffected.

* Data Plane Runtime have the [worker threads](https://github.com/istio/ztunnel/blob/46acf764633bb109037cc231670dd5df74a50219/src/app.rs#L239) which handles the actual user traffic. This is the high-performance low-latency multi-thread Tokio runtime route to handle users requests which includes accepting incoming client connections, processing request headers/data, applying policies (load balancing, retries, timeouts, security), establishing outgoing connections to upstream services (this is where the "connection pool" comes in), forwarding data between client and server. The worker thread count (defaults to 2) is configurable based on the expected load and available hardware resources, common starting point often being the number of CPU cores spreading the load of encrypting/decrypting traffic, parsing, and other request processing tasks across multiple CPU cores. Tokio's multi-threaded runtime can efficiently manage many concurrent connections across a few OS threads by leveraging non-blocking I/O. This allows ztunnel to handle a high volume of requests simultaneously.

Ideally, these two runtimes operate largely independently. This separation is a robust design. The admin runtime can be busy fetching a large xDS update, or even hang momentarily, without directly stalling the forwarding of packets on the worker threads.

The connection pool is managed by worker threads. When establishing connection it consults the current configuration (provided by the admin runtime) to know where to connect, thus this configuration needs to be made available to the worker threads in a thread-safe way, done using mpsc channel.

## Conclusion

I urge folks who are interested to go through the ztunnel codebase and contribute to the project, its really well designed, and too big to cover in a single blog. A lot of things to learn from the codebase. 

Don't forget to Star it as well! Though I have covered a lot of technical aspects in here.

## Grateful

I am more than grateful to the wonderful folks at Solo.io who mentored me - [Ian Rudie](https://github.com/ilrudie), [John Howard](https://github.com/howardjohn), [Ben Leggett](https://github.com/bleggett) and [Faseela K](https://github.com/kfaseela).
Forever grateful to them for volunteering their time and effort. 
