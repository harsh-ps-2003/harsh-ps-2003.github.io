+++
title = "GCN from POV of CNN"
date = 2026-04-13
+++

Well, I was playing with [Graphcast](https://deepmind.google/blog/graphcast-ai-model-for-faster-and-more-accurate-global-weather-forecasting/), explaining my prof how MPNNs works to make him understand stuff (he is a physics prof). Got some interesing intuitions when thinking about how GCN can be derived from CNNs.

## CNN revisited
In basic CNNs we have an example image, we select a portion of the image and we know that each pixel is in [0, 255] in RGB. We also have a kernel whose value is updated via backpropagation. We simply multiply kernel with our image portion and the value we get sits at the center of our image portion. For other values in image portion, we just convolve the kernel. 

## Analogy with Graph

Simple, each cell in image portion acts like node pointing towards the center, and each node value is pixel values. The edges are kernel values. To apply convalution to this graph, I do the same thing, node*edge this time for all nodes and again its at the central node. So, intutively, each node has information which they are passing to central node. The central node is just weighted average of neighbouring nodes. 







