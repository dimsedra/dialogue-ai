nstall Ladybug
Ladybug is an embedded graph database that can be used from the command line and from a variety of programming languages. This page shows all the ways you can install Ladybug. After installation, you can learn how to run Ladybug by creating your first graph.

License

All source code and pre-compiled binaries of Ladybug are distributed under the MIT License. By installing and using Ladybug, you acknowledge and agree to these terms.

Command Line (Shell)
If you don’t need Ladybug embedded in your application, you can use the CLI shell. This is a standalone executable with no dependencies that can be used to interact with a Ladybug database using just Cypher.

Linux
macOS
Windows
Nix
Use a tool like curl to download the latest version of the Ladybug CLI to your local machine. Alternatively, simply open this URL in your browser.

Terminal window
curl -L -O https://github.com/LadybugDB/ladybug/releases/latest/download/lbug_cli-windows-x86_64.zip

Right-click on the lbug_cli-xxx.zip file and click on Extract All. This will create a directory containing a file named lbug.exe. Then, right-click on the directory and click “Open in terminal”. From within the terminal, you can then run ./lbug.exe.

Python
You can use uv, pip, or nix to install the Ladybug Python client library. The instructions are the same for Linux, macOS, and Windows.

uv
pip
nix
Terminal window
uv init
uv add ladybug

Node.js
Use npm to install the Ladybug Node.js client library.

Terminal window
npm install @ladybugdb/core

Java
The latest stable version is available on Maven Central.

Terminal window
<dependency>
  <groupId>com.ladybugdb</groupId>
  <artifactId>lbug</artifactId>
  <version>0.11.0</version>
</dependency>

Rust
Use Cargo to install the Ladybug Rust client library. This will by default build and statically link Ladybug’s C++ library from source. You can also link against the dynamic release libraries, as described in the crate docs.

Terminal window
cargo add lbug

Go
Ladybug’s Go API is a wrapper around the C API of Ladybug. The installation step below assumes that you have initialized a Go project that has a go.mod file, as described in the official tutorial.

Terminal window
go get github.com/LadybugDB/go-ladybug

Swift
To add lbug-swift to your Swift project, you can use the Swift package manager.

Add the package to your Package.swift dependencies.

Terminal window
dependencies: [
  .package(url: "https://github.com/LadybugDB/swift-ladybug/", branch: "0.11.0"),
],

You can change the branch to a tag to use a specific version (e.g., 0.11.0 for the latest stable release or main for the latest development version).

Add Ladybug to your target dependencies.

targets: [
  .target(
    name: "YourTargetName",
    dependencies: [
      .product(name: "Ladybug", package: "swift-ladybug"),
    ]
  )
]

Alternatively, you can add the package through Xcode:

Open your Xcode project.
Go to File > Add Packages Dependencies....
Enter the URL of the ladybug-swift repository: https://github.com/LadybugDB/swift-ladybug.
Select the version you want to use (e.g., 0.11.0 for the latest stable release or main for the latest development version).
C/C++
Use a tool like curl to download the latest version of the Ladybug C/C++ binaries to your local machine.

The Ladybug C++ client is distributed as a so/dylib/dll+lib library file along with a header file (lbug.hpp). Once you’ve downloaded and extracted the C++ files into a directory, you can link it to your C++ program by adding the directory to your build system’s search paths.

Linux
macOS
Windows
Terminal window
curl -L -O https://github.com/LadybugDB/ladybug/releases/download/v0.11.0/liblbug-windows-x86_64.zip

Ladybug Explorer
Ladybug Explorer is a web-based GUI for Ladybug. It allows you to explore and query your Ladybug database using a web browser. Refer to the Ladybug Explorer GitHub repo for more details.

Ladybug MCP Server
Our Model Context Protocol server allows you to expose your Ladybug database as a tool that can be used by LLMs and agents. Refer to the Ladybug-MCP GitHub repo for more details.

Nightly Builds
If you want access to the latest features in development, you can use our nightly builds.

Python: uv pip install --pre ladybug
Node.js: npm i @ladybugdb/core@next
Java: The latest snapshot version is available on GitHub Packages
For the CLI, C/C++ shared libraries, and Rust crate, the latest nightly versions for each can be downloaded from the latest run of this GitHub Actions workflow.