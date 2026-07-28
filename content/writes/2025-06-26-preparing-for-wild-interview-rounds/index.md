+++
title = "Preparing for wild interview rounds"
date = 2025-06-26
draft = true
+++

> This is interview-focused writeup!

A lot of interviews coming up! I did some DSA practice earlier along with foundational CS courses, but I was forgetting them. I just used to solve DSA problems randomly, taking my own sweet time to come up with solutions. So, just wanted to note down some important concepts to revise later. I can't solve all these problems again, they are just too much. Also, remembering stuff is important given how difficult Leetcode interviews have become in 2025! I get nightmares on how someone with an actual job will have to do these things to get an offer from another compnay. 

Hilariously, most candidates can't even explain their day job if you go deep enough. Interviewing is interesting in the age of LLMs.

## Data Structures and Algorithms
After doing a lot of FOSS for almost 2.5 years since freshman year, it's time that I actively start preparing for jobs. Now, DSA is the only thing that will be expected from me in my interviews, and my resume will be thrown to trash anyways (｡•́︿•̀｡). So lets do some *Data Structures* and *Algorithms* now. I have a lot of interviews coming up!

Generally in 40 min, I will need to solve minimum 2 algorithms questions with followups, thus recognizing patterns is crucial, I don't think anyone can problem-solve themselves out of such interviews if they haven't been exposed to such problems, until and unless they are into some Competitive Programming. 

I am very very time constrained right now - doing undergraduate research in ML + internships + mentoring folks in Google Summer of Code + managing dreaded academic of IIT Kanpur + some dating (≧ε≦)

So the approach I am following for optimal results is :
* Not solving random problems, brain needs to internalize patterns.
* Take a look at easy problem solutions when starting out, don't solve them. Solve only medium-hard questions on Leetcode. Difficult problems are just a mix of some easy problems with some observations involved.
* Focus on whether you are able to think intuitive steps from bruteforce to optimal. Don't waste a lot of time coding each and every problem out. Just code the difficult ones.
* [Work hard on a single problem until you figure it out is a great approach for Competitive Programming given you have a lot of time.](https://www.youtube.com/watch?v=bSdp2WeyuJY) But when you are heavily time constrained, or preparing for simpler interviews, pattern recognition is the key!

And, I personally feel that practicing DSA in Rust (or your favourite programming language) is one of the best way to actually learn the programming language itself. So, not a total waste of time doing Leetcode.

You know I am Rusty, but you should never use Rust in DSA interviews, until and unless you either wanna be mentally harassed in the interview or even better, harass your interviewer (￣▽￣)

You need to be borderline masochistic to even think about doing that! Implementing Data Structures in Rust is a serious task.

### General Stuff 

* In Python, `self` refers to the instance of the class — the object on which the method is called. Any variable assigned as `self.some_var` becomes an instance variable/property, accessible by all methods of the class on that specific object. Variables without `self` inside methods are local to that method and do not persist or share state across methods.
* Despite their efficiency, hash collisions can degrade performance, and techniques such as chaining and open addressing are used to manage them.
* List isn't hashable becuase its mutable. So convert it to tuple as its immutable hence can be hashed.
* `ord('a')` converts to ASCII and `chr(64)` converts back to string
* `min("abc", "def")` returns lexographically smaller string
* Playing with array and hashmap/set :
```python
my_list = [1, 2, 3]
my_list.append(4) # add one element at the end of list
print(my_list)  # Output: [1, 2, 3, 4] 
my_list.extend([5, 6])
# Or: my_list += [5, 6] # concatinate with another list
print(my_list)  # Output: [1, 2, 3, 4, 5, 6]
my_list.insert(0, 10) # insert value at a specific index
print(my_list)  # Output: [10, 1, 2, 3, 4, 5, 6]
my_list.remove(3) # remove first occurance of value
print(my_list)  # Output: [10, 1, 2, 4, 5, 6]
my_list.pop(2) # remove value at specific index, default removal of last value
print(my_list)  # Output: [10, 1, 4, 5, 6]
del my_list[1:3] # remove slice
print(my_list)  # Output: [1, 6]
my_list.clear()
print(my_list)  # Output: []

visit = set()
visit.add((r, c)) # add tuple to set, cant add list they are immutable
visit.remove((r, c))

d = {}
result = []
d["a"] = 1           # Adds key "a" with value 1
d["a"] = 5           # Modifies key "a" to value 5
d.update({"b": 2, "c": 3})     # Adds/updates multiple key-value pairs
val = d.pop("a")     # Removes key "a" and returns its value
del d["b"]           # Removes key "b" (raises KeyError if not present)
key, val = d.popitem()   # Removes and returns the last (key, value) pair
d.clear()             # Empties the dictionary
# Iterate over keys
d = {"a": 1, "b": 2, "c": 3}
for key in d:
    print(key)            # Output: a, b, c
# Iterate over values
for value in d.values():
    print(value)          # Output: 1, 2, 3
# Iterate over key-value pairs
for key, value in d.items():
    # Use append with a tuple or list
    result.append((key, value))  # Append as a single element (tuple)
    # or
    # result.append([key, value])  # Append as a list

print(result)  # [('a', 1), ('b', 2), ('c', 3)]
# Also include index
for i, (key, value) in enumerate(d.items()):
    print(i, key, value)

# when sorted, returns list of tuples, not dictionary
sorted_transactions = sorted(dictionary.items(), key=lambda x: x[1])

s = set()
s.add(1)
s.add(2)
# Iterating
for element in s:
    print(element)   # 1 2 3 (order not guaranteed)
s.remove(2)        # Removes 2, raises KeyError if not found
s.discard(3)       # Removes 3 if present, does nothing otherwise
e = s.pop()        # Removes and returns an arbitrary set element
s.clear()

```
* Int to String and vice versa
```python
n = 42
s = str(n)       # s will be "42"
s = "42"
n = int(s)       # n will be 42 (int)
```
* To remove all occurrences of an element from a  list in-place (i.e., without creating a new array), the usual approach is to modify the original list by overwriting unwanted elements and then truncating its length. Python lists don’t support deleting elements efficiently inside loops without extra space. 
* A stable sorting algorithm is the one that sorts the identical elements in their same order as they appear in the input, whilst unstable sorting may not satisfy the case. Merge Sort, Bubble Sort, Insertion Sort, etc are stable, whereas Heap Sort, Quick Sort, etc are unstable
```
Collection to be sorted: {(6, 3), (5, 5), (6, 1), (1, 3)}
Stable Sorted: {(1, 3), (5, 5), (6, 3), (6, 1)}
Regular Sorted: Either {(1, 3), (5, 5), (6, 3), (6, 1)}, or {(1, 3), (5, 5), (6, 1), (6, 3)}
```
* `arr.sort(reverse=True)` for sorting in descending order and `arr.sort()` for ascending. `arr.sort(key=lambda x: x[0] + x[1])` to sort array by sum.
* Avoid checking if key exists and then entering :
```python
from collections import defaultdict

freq = defaultdict(int) # defaultdict(lambda: 1) for default 1 frequency instead of 0
nums = [1, 2, 2, 3, 3, 3]

for i, num in enumarate(nums):
    freq[num] += 1  # No need for if-else check of key
print(dict(freq)) # {1: 1, 2: 2, 3: 3}

nums = [1, 2, 2, 3, 3, 3]
count = {}
for n in nums:
    count[n] = 1 + count.get(n, 0)
print(count)  # {1: 1, 2: 2, 3: 3}

from collections import Counter
nums = [1, 2, 2, 3, 3, 3]
freq = Counter(nums)
print(dict(freq))  # {1: 1, 2: 2, 3: 3}
```
* Use counter for frequency counting :
```python
from collections import Counter

nums = [5, 1, 2, 2, 3, 3, 3, 4]
freq = Counter(nums)
print(dict(freq))   # Output: {5: 1, 1: 1, 2: 2, 3: 3, 4: 1}
# Sort by key (ascending)
print(sorted(freq.items()))  # [(1, 1), (2, 2), (3, 3), (4, 1), (5, 1)]

# Sort ONLY by frequency (ascending)
print(sorted(freq.items(), key=lambda x: x[1]))
# Output: [(5, 1), (1, 1), (4, 1), (2, 2), (3, 3)]

# Sort ONLY by frequency (descending)
print(sorted(freq.items(), key=lambda x: -x[1]))
# Output: [(3, 3), (2, 2), (5, 1), (1, 1), (4, 1)]

# Sort by frequency (descending), then by key (ascending)
print(sorted(freq.items(), key=lambda x: (-x[1], x[0])))

diff = ["aaa", "aa", "a"]
freq2 = Counter(diff)
print(dict(freq2))  # Output: {'aaa': 1, 'aa': 1, 'a': 1}
```
* Modify list in-place without re-allocating memory
```python
nums = [1, 2, 3, 4, 5]
nums = [x for x in nums if x % 2 == 0]  # Removes odd numbers
squares = [x * x for x in nums]
```
* Enumerate instead of manual indexing :
```python
nums = [10, 20, 30]
for i, num in enumerate(nums):
    print(i, num)  # 0 10, 1 20, 2 30
```
* Zip to iterate multiple lists and create window :
```python
names = ["Alice", "Bob", "Charlie"]
ages = [25, 30, 22]
for name, age in zip(names, ages):
    print(name, age)
```
```python
arr = [1, 3, 5, 7, 9]
windows = list(zip(arr, arr[1:], arr[2:]))  
print(windows)  # [(1, 3, 5), (3, 5, 7), (5, 7, 9)]
```
* Ceil and Floor 
```python
import math

print(math.ceil(4.7))    # Output: 5
print(math.ceil(-10.7))  # Output: -10

print(math.floor(2.3))   # Output: 2
print(math.floor(-33.89))# Output: -34
```
* Use `.join()` instead of `+` for string concatenation for better performance
```python
words = ["hello", "world"]
sentence = " ".join(words)  # Efficient
sentence = words[0] + " " + words[1]  # Slow in loops
```
* `bisect` for simple Binary Search 
```python
"""
Only for ascending order
"""
import bisect

arr = [1, 3, 5, 7, 9]
# Returns First Element >= 5 -> if target = 5 is there then Binary Search, if not then it returns the position where the target would be inserted.
target = bisect.bisect_left(arr, 5)  # 2
lower_bound_index = bisect.bisect_left(arr, 6)  # 3
# Returns First Element > 7
upper_bound_index = bisect.bisect_right(arr, 7)  # 4
```
* Generate Permutations and Combinations directly
```python
from itertools import combinations, permutations

arr = [1, 2, 3]
print(list(combinations(arr, 2)))  # [(1,2), (1,3), (2,3)]
print(list(permutations(arr, 2)))  # [(1,2), (1,3), (2,1), (2,3), (3,1), (3,2)]
```
* In queue (FIFO) elements added from back and removed from front - first element added in the list gets removed first, whereas in Stack (LIFO) elements are added to the top and removed from the top as well - last element added is removed first. We get reversed elements when we pop from the stack. So when you want to get reverse elements, dont just store in list and reverse, instead simply pop from stack.
```python
from collections import deque
stack = []

# Push O(1)
stack.append(10)
stack.append(20)
# Top element
top = stack[-1]
# Pop O(1)
stack.pop()     # 20
stack.pop()     # 10

# Slicing from top
stack = [1, 2, 3, 4, 5]  # Pushed in order: 1 (bottom) to 5 (top)
top_three = stack[-3:]  # Returns [3, 4, 5] (3rd top: 3, 2nd top: 4, top: 5)

queue = deque()
# Enqueue elements
queue.append(1)
queue.append(2)

# Dequeue elements (removes from front)
front = queue.popleft() # O(1)

# O(1) time complexity for both append (to the right) and popleft (from the left)
```
* `heapq` for Priority Queues
```python
"""
Min-heap has smallest element on top - use it for finding k largest, Max-heap has largest element on top - used to find k smallest.
Poping from heap of size k is log(k).

The k-th largest element is the smallest element among the top k largest elements. This means we only need to maintain k elements in our Min-Heap to efficiently determine the k-th largest element. Whenever the size of the Min-Heap exceeds k, we remove the smallest element by popping from the heap. 

heapify() - Used when you have an existing unsorted list and want to convert it into a heap all at once. Runs in O(n) time. You only call this once, then you can use heappop or heappush. A sorted array ascending/desecending is already a valid min-heap/max-heap. But if you want a max-heap from an ascending sorted array, you would need to reverse it or heapify. O(n) Time Complexity

heappush() - Used to insert one element into an already valid heap. Maintains heap property by reordering as needed. Runs in O(log n) time per push. If you build a heap by pushing elements one after another, no need to call heapify(). O(logn) Time Complexity

heappop() - Removes and returns the smallest element (min-heap), then rebalances. O(logn) Time Complexity for one pop, so O(klogn) for k pops

heap[0] - Accesses the smallest element without removing it in O(1)
"""
import heapq

nums = [7, 2, 9, 4, 1]
heapq.heapify(nums)  # Convert to heap
print(heapq.heappop(nums))  # Removes smallest element (1)
# Convert to a max-heap in-place
nums = [-num for num in nums]  # Negate all values
heapq.heapify(nums)  # Convert to min-heap (which acts as max-heap)

# Example list of pairs
nums = [[1, 2], [7, 3], [4, 1], [2, 5]]
k = 2

# Create an empty list to use as a heap
heap = []

# Push all elements into the heap with their sum as the priority
for pair in nums:
    # tuple: (priority, actual_value)
    heapq.heappush(heap, (pair[0] + pair[1], pair))

# Pop the smallest k elements from the heap
result = []
for _ in range(min(k, len(heap))):
    sum_val, pair = heapq.heappop(heap)
    result.append(pair)

print(result)  # [[1, 2], [4, 1]]  → smallest sums
```
* Kth largest element - The smallest element is always at the top in min-heap. Every time the heap’s size exceeds k, pop the min element (smallest in heap). After all insertions, the min-heap contains the k largest elements from the array. The root of the min-heap (min_heap) is the smallest among the k largest elements, i.e., it is the k-th largest in the whole array. Similarly, The k-th smallest element is the largest element among the top k smallest elements.
```python
import heapq
"""
Time complexity: O(klog⁡n)
Space complexity: O(k)
Heapify in O(n) and we pop k times O(logn)

For a list of lists or tuples, it uses the first element of each sub-list/tuple unless specified otherwise. 
"""
# O(n + k log n)
def kth_largest_heap(arr, k):
    # returns a list of the k largest, sorted largest to smallest
    ans = heapq.nlargest(k, arr)
    return ans[-1] # the last element is kth largest

# O(n + k log n)
def kth_smallest_heap(arr, k):
    # returns a list of the k largest, sorted smallest to largest
    ans = heapq.nsmallest(k, arr)
    return ans[-1]  

data = [(2, "B"), (1, "C"), (3, "A")]
# Get 2 "smallest" by first value
out = heapq.nsmallest(2, data, key=lambda x: x[0])  # [(1, 'C'), (2, 'B')]
# Get 2 "largest" by the string, alphabetically
out2 = heapq.nlargest(2, data, key=lambda x: x[1])  # [(3, 'A'), (2, 'B')]
```
* If array is small in problems of finding kth smallest or largest, then its better to do it with a single loop then heap. If 
```python
    first_largest = float('-inf')
    second_largest = float('-inf')
    third_largest = float('-inf')

    for num in nums:
"""
If num is greater than first_largest: This means we've found a new largest number. We update third_largest to the previous second_largest, second_largest to the previous first_largest, and first_largest to the current num.
"""
        if num > first_largest:
            third_largest = second_largest
            second_largest = first_largest
            first_largest = num
"""
Else if num is greater than second_largest: This means num is the new second largest (but not the largest). We update third_largest to the previous second_largest and second_largest to num.
"""
        elif num > second_largest:
            third_largest = second_largest
            second_largest = num
"""
Else if num is greater than third_largest: This means num is the new third largest (but not larger than the first or second). We update third_largest to num.
"""
        elif num > third_largest:
            third_largest = num
```
* Dequeue for effective queue and stack implementation. Insert (enqueue) and pop (dequeue) are O(1) is queue.  Queues are used when you want to process elements one at a time from the front, as in printers, scheduling, or BFS (breadth-first search). Rolling average or moving sum (Fixed window size) and Sliding window maximum.
```python
from collections import deque

queue = deque([1, 2, 3, 4, 5])
queue.popleft()  # Removes 1 in O(1), NO shifting required!
``` 
* If characters only lowercase then store frequency in 26-size list is better than storing in hashmap (dictionary). A list of 26 integers uses less memory than a dictionary, which stores keys, values, and additional metadata. List access by index is faster than dictionary key lookup.
```python
s = "abracadabra"
freq = [0] * 26
for ch in s:
    freq[ord(ch) - ord('a')] += 1
```
* Recursion simply simulates future and combines the result of explored paths. Every recursion call is going to end up at base case, where it returns. So, just write the recurion call assuming that you are in base case. And to think of base condition, just simulate smallest value inputs.
* `@lru_cache` for memoization. Do manually if required to customize key structure and cache policies. Memoization is most effective when the problem has overlapping subproblems and you only care about the result (e.g., count, existence, or max sum), not the actual combinations.
```python
def factorial(n, memo=None):
    # Use memo dictionary to store previously computed factorials
    if memo is None:
        memo = {}

    # Base case
    if n == 0 or n == 1:
        return 1

    # Check memo
    if n in memo:
        return memo[n]

    # Recursive computation with memoization
    memo[n] = n * factorial(n - 1, memo)
    return memo[n]
```
* Python doesnt have in-built Ordered Map (TreeMap and BTreeMap), but its used for keeping the keys in sorted order in key-value store, i.e store frequency of sorted elements directly. This allows for efficient `(O(log n))` insertion, deletion, and lookup operations, as well as range queries.
* Priority queue (implemented using a min-heap or max-heap) achieve `O(log n)` time complexity for insertion (add element to the heap and perform heapify-up) and deletion (remove the root (min/max), replace with the last element, and heapify-down) operations, along with `O(1)` access to the highest-priority element. However, arbitrary element lookup/search and then removing remains `O(n)` due to the heap's structure. Prefer this for contiguous arrays. So, if you continuously want to get max/min value, use heap.
* When using `math.pow(base, exponent)` the time complexity is O(log exponenet). Incase this is causing overflow (expoenents can be huge), resort to using a simple for loop to calculate the power only till its required to compare.
* Use bit for faster even/odd :
```python
def is_odd(x):
    return (x & 1) == 1  # Odd if last bit is 1

def is_even(x):
    return (x & 1) == 0  # Even if last bit is 0
```
* When the elements in integer are in ascending order, then its smallest, out of all possibilities.


Now once we know how to exploit Python properly for our interviews, lets jump into the waters of *actual problem solving*.

There are too many questions, but the concepts are limited, so crux of problem solving would be :
* always write examples to understand the problem
* break the problem into simpler versions
* exploit the defining features of the problem
* seek symmetry and patterns among problems
* dry run for intutions

Always do some examples to understand the problem well. Never forget Edge Cases:
* Empty input
* Duplicate elements
* Zero/Negative numbers
* Overflow cases
* Constraints on inputs and outputs
* Intendation Error

## Things to notice :
#### Constraints
* If the constraints are n <= 20, then Brute force approaches are viable. Backtracking and recursion leading to exponential time complexity (2^n, n!) is acceptable.
* If n lies between 10^3 and 10^6, then most probably O(nlogn) or O(n) solution is requied. Try Heaps, Pointers, Greedy or Dynamic Programming
* If n >= 10^7, only O(logn) or O(1) solution is vaible. 
#### Output Format
* List of Lists (combinations, subsets, paths) - Backtracking is almost always the answer. Generate all possibilities. Use recursion with choice/no-choice pattern
* Single Number (max/min profit, cost, ways, jumps) -
Dynamic Programming for optimization. Greedy for local optimal choices.
* Modified Array/String (in-place operations) - Two Pointers for in-place modifications
#### Patterns
* If we have to continuously remove elements from between in the array, then deque is better. For the circular game, you can rotate the queue (move elements from front to back) and then remove the front element, all in O(1) per operation. This avoids the repeated shifting that happens in an array.
* If sorted array is given, Binary Search, Pointers, Greedy.
* Nearest smaller/larger element problems, next greater/smaller element queries -> Monotonic Stack. When order of past element matters then apply.
* Generate with some condition, recursion/backtracking
* Maintaing smallest and largest in a array, both obtained in O(1) -> Monotonic Increasing Queue
* If list of list is given as input, and a sort of adjcency maps is being created for traversing, then its graph problem. Also, when you have to visit places, it can be graph. 
* BFS for level based traversal (shortest path) whereas DFS for recursive exploration. When you want to find the shortest distance/time from any one of several starting nodes to other nodes, use multi-source BFS. Problems where multiple initial points influence the state simultaneously (e.g., infection spreading, water flooding). If the goal is to reach from somewhere to somewhere (source to target), then it might be graph if List of List is given as input. 
* Topological Sort for dependency and Union Find for group finding
* Dynamic Programming Keywords - "Number of ways", "Maximum/minimum" + "sum/profit/cost", "Can you reach", "Longest/shortest subsequence", "Optimal" or "best"
* Two Pointers Keywords - "Palindrome", "Sorted array", "Target sum", "Remove duplicates"
* Sliding Window - "Substring" with conditions, "Subarray" with fixed/variable size, "Maximum/minimum window", "Contains all"
* Heap Keywords - "K largest" or "K smallest", "Top K elements", "Median", "Priority"
* Stack Keywords - "Nested structure", "Undo operations"
* Binary Search - "Search in sorted", "Minimize maximum" or "Maximum"/"Minimum", "First/last occurrence", 
* We need to have left and right boundary (min and max) for Binary Search along with a property to cancel elements before/after mid. One such property is of sorting, but it can be any `check()` given its monotonic. The main idea is to alter the problem so the answer is not simply a matter of picking the largest-values-first (greedy), but of searching for a threshold or minimal/optimal value that cannot be directly achieved by sequentially picking values.

Every problem listed is unique and teaches you something. Lets gooo....

### Arrays
* XOR to find unique element and duplicates
```python
nums = [1, 2, 2, 3, 3]
unique = 0

for num in nums:
    unique ^= num  # XOR accumulates and cancels out duplicates

print(unique)  # Output: 1
```
* Rotation of array and Reverse after m positions
```python
def rotate(arr, k):
    k %= len(arr)  # Handle cases where k > len(arr)
    return arr[-k:] + arr[:-k]  # Move last k elements to the front
    return arr[k:] + arr[:k]  # Move first k elements to the back

def reverse_after_m(arr, m):
    arr[m+1:] = arr[m+1:][::-1]  # Reverse portion after m
    return arr
```
* A subarray/substring is a contiguous part of an array, meaning all elements are taken in sequence and without skipping any in between. A subsequence is a sequence that can be derived from the array by deleting some (or no) elements without changing the order of the remaining elements. Elements need not be contiguous. A subset is any possible combination of the original elements, regardless of order or contiguity. Generating subarry by bruteforce is O(n^2) and subset and subsequence is O(n⋅2^n) with space O(n).
* When finding target sum, if array is not sorted, it's better to use hashmap to store the index-value pair and then do a o(n) search on array with o(1) lookup in hashmap to get the target sum. But if the array is sorted, two-pointer should be used as the sum can be increased/decreased to match the target sum (move i forward to increase the sum, move j back to decrease the sum according to the target). 
* Prefix Sum to find sum between specific indices in array. Useful for subarray sum and continuity (contiguous) is maintained.
```python
"""
prefix[i] stores the sum of all elements from index 0 to i-1.
prefix = 0 represents the sum before any elements.
This lets you get the sum of any subarray arr[l:r] using:
sum(l,r) = prefix[r+1] − prefix[l]
This reduces querying subarray sums from O(n) to O(1) in time, using O(n) in space for prefix sum array
"""
def prefix_sum(self, arr):
    n = len(arr)
    prefix = [0] * (n + 1) # prefix sum array has added element as sum of all numbers at last
    for i in range(n): # iterate till n - 1
       prefix[i+1] = prefix[i] + arr[i]
    return prefix

# iterating across all l and r is O(n^2)
def range_sum(self, prefix, l, r):
    return prefix[r+1] - prefix[l]

# instead find target - l from map of prefix sums
count = 0
prefix = self.prefix_sum(nums)

prefix_counts = defaultdict(int) 
prefix_counts[0] = 1  # sum = 0 before starting {0 : 1}

for i in range(1, len(prefix)):
    curr_sum = prefix[i]
    needed = curr_sum - sum(l, r)
    count += prefix_counts.get(needed, 0)
    prefix_counts[curr_sum] += 1

return count
```
* Difference Array technique allows us to update a range in array but just changing 2 elements. To increase the value in range [a, b] by x, increase the value at position a by x, and b+1 by -x, and then prefix sum over those indices. 2D Difference Array is quite useful in Image processing.
```python
def apply_range_updates(array_length, updates):
    """
O(1) per update
    """

    # Step 1: Create a difference array of size (n + 1) initialized to 0
    diff_array = [0] * (array_length + 1)

    # Step 2: Apply each update in O(1) using the diff array
    for start, end, increment in updates:
        diff_array[start] += increment
        if end + 1 < array_length:
            diff_array[end + 1] -= increment

    # Step 3: Convert the diff array to the final result using prefix sum
    final_array = [0] * array_length
    final_array[0] = diff_array[0]

    for i in range(1, array_length):
        final_array[i] = final_array[i - 1] + diff_array[i]

    return final_array

```
* Maximum Subarray sum
```python
def kadane(arr):
        """Maximum subarray sum"""
        max_current = max_global = arr[0]
        for i in range(1, len(arr)):
            max_current = max(arr[i], max_current + arr[i])
            max_global = max(max_global, max_current)
        return max_global
```
* Quick and Merge Sort are O(nlogn) but if finite elements are there, then use Bucket Sort to sort in O(n) time and O(1) space in-place. When you have a large dataset and want to distribute the sorting workload, its useful. Sorting in memory is faster than sort on disk. However if you have more data than will fit in memory you need another option. What you can do is a bucket sort, where the buckets are small enough to fit into memory. i.e. there is a large number of entries in each bucket. These you can quick sort individually.
* Starting the pointer from back is benefitial if you are trying to merge things with any condition (like non-decreasing).
* [Defuse the Bomb](https://leetcode.com/problems/defuse-the-bomb/)
* [Repeated DNA Sequences](https://leetcode.com/problems/repeated-dna-sequences/) (Bit Manupulation)
* [String Compression](https://leetcode.com/problems/string-compression/description/)
* [Longest Consecutive Subsequence](https://leetcode.com/problems/longest-consecutive-sequence/description/)
* [Maximum Points You Can Obtain from Cards](https://leetcode.com/problems/maximum-points-you-can-obtain-from-cards/)
* [Count Subarray Sum Equals K](https://leetcode.com/problems/subarray-sum-equals-k/) (prefix sum in case of Integers and Sliding wondow in case of Whole Numbers) and a slight modification - [Contiguous Array](https://leetcode.com/problems/contiguous-array/)
* [Corporate Flight Bookings](https://leetcode.com/problems/corporate-flight-bookings/)
* [Maximum Frequency of an Element After Performing Operations](https://leetcode.com/problems/maximum-frequency-of-an-element-after-performing-operations-ii/description/)
* [Next Permutation](https://leetcode.com/problems/next-permutation)
* [Product of Array Except Self](https://leetcode.com/problems/product-of-array-except-self/) (two pass, Prefix and Suffix both)
* [Car Pooling](https://leetcode.com/problems/car-pooling/)
* [Substring with Concatenation of All Words](https://leetcode.com/problems/substring-with-concatenation-of-all-words)
* [Longest Substring Without Repeating Characters](https://leetcode.com/problems/longest-substring-without-repeating-characters/) and [Maximum Erasure Value](https://leetcode.com/problems/maximum-erasure-value/)
* [Minimum Size Subarray Sum](https://leetcode.com/problems/minimum-size-subarray-sum/) (sliding window better than binary search), and its variation [Subarray Product Less Than K](https://leetcode.com/problems/subarray-product-less-than-k/)
* [Count Number of Nice Subarrays](https://leetcode.com/problems/count-number-of-nice-subarrays/) and [Subarrays with K Different Integers](https://leetcode.com/problems/subarrays-with-k-different-integers/) both use Atmost concept `exactly(K) = atMost(K) - atMost(K-1)`
* [Max Consecutive Ones](https://leetcode.com/problems/max-consecutive-ones-iii/) and [Longest Repeating Character Replacement](https://leetcode.com/problems/longest-repeating-character-replacement/) both uses "K-Flips"
* [Minimum Operations to Reduce X to Zero](https://leetcode.com/problems/minimum-operations-to-reduce-x-to-zero/)
* [Count Subarrays Where Max Element Appears at Least K Times](https://leetcode.com/problems/count-subarrays-where-max-element-appears-at-least-k-times/description/)
* [Container with Most Water](https://leetcode.com/problems/container-with-most-water/description/)
* [Partition Equal Subset Sum](https://leetcode.com/problems/partition-equal-subset-sum/description/) and its harder version [Partition Array Into Two Arrays to Minimize Sum Difference](https://leetcode.com/problems/partition-array-into-two-arrays-to-minimize-sum-difference/description/) (meet-in-the-middle technique)
* [Minimum Window Substring](https://leetcode.com/problems/minimum-window-substring)
* [Integer to English Words](https://leetcode.com/problems/integer-to-english-words/description/)
* [Sort Colors](https://leetcode.com/problems/sort-colors/) or [Seperate Black and White balls](https://leetcode.com/problems/separate-black-and-white-balls/)

### Strings
* [Isomorphic Strings](https://leetcode.com/problems/isomorphic-strings/)
* [Encode and Decode Strings](https://leetcode.com/problems/encode-and-decode-strings/description/)
* [Minimum Changes To Make Alternating Binary String](https://leetcode.com/problems/minimum-changes-to-make-alternating-binary-string/description/)
* [Longest Substring without Repeating Character](https://leetcode.com/problems/longest-substring-without-repeating-characters/)
* [Find All Anagram in a String](https://leetcode.com/problems/find-all-anagrams-in-a-string/) and [Permutations in String](https://leetcode.com/problems/permutation-in-string/)
* [Maximum Score After Splitting a String](https://leetcode.com/problems/maximum-score-after-splitting-a-string/)
* [String Compression](https://leetcode.com/problems/string-compression/)
* [Flip String to Monotonic Increasing](https://leetcode.com/problems/flip-string-to-monotone-increasing/)
* [Longest Substring with At Most K Distinct Characters](https://leetcode.com/problems/longest-substring-with-at-most-k-distinct-characters/description/) with easier version [Fruit Into Baskets](https://leetcode.com/problems/fruit-into-baskets/)

### LinkedList
* In typical bruteforce solutions of LL, when we want to find lenght of LL :
```python
"""
O(N) Time 
"""
def length_of_linked_list(head: Optional[ListNode]):
"""
Although nodes is just a Python list, each element in nodes is still a reference to a node in the original linked list.
"""
    nodes = []
    current = head
    while current is not None:
        nodes.append(current)
        current = current.next
    return len(nodes)

    # if we want to remove from back in bruteforce way
    removeIndex = len(nodes) - n
        if removeIndex == 0:
            return head.next
    # directly operate on nodes array as its reference to LL
    nodes[removeIndex - 1].next = nodes[removeIndex].next
    return head
```
* If we are working on the problems where we are asked to remove head node only and there are no other nodes in the linkedlist the dummy node can handle this case and our logic will work fine else we will need to add extra if conditions to handle this special case. Beware of `.next.next` giving null pointer exception.
* Reverse Sublist
```python
"""
Time - O(n) and Space - O(1)
"""
class Solution:
    def reverseBetween(self, head: Optional[ListNode], left: int, right: int) -> Optional[ListNode]:
        if not head or left == right:
            return head

        dummy = ListNode(0, head)
        prev, head = dummy, dummy.next
         
        # Move `prev` to node before `left`
        for _ in range(left - 1):
            prev = prev.next

        # `start` is the first node to reverse
        start = prev.next
        then = start.next

        # Reverse the sublist using head-insertion
        for _ in range(right - left):
            start.next = then.next
            then.next = prev.next
            prev.next = then
            then = start.next

        return dummy.next
```
* Loop Detection and Removal from LinkedList (Fast and Slow pointers)
```python
def detect_and_remove_cycle(head: ListNode) -> ListNode:
    if not head or not head.next:
        return head

    # Step 1: Detect loop
    slow = fast = head
    has_cycle = False

    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow == fast:
            has_cycle = True
            break

    if not has_cycle:
        return head  # No loop detected

    # Step 2: Find the start of the loop
    slow = head
    while slow != fast:
        slow = slow.next
        fast = fast.next

    # slow (or fast) is now at the start of the loop

    # Step 3: Find the last node in the cycle and break it
    ptr = slow
    while ptr.next != slow:
        ptr = ptr.next

    ptr.next = None  # Break the loop

    return head
```
* [Delete the middle node of a Linked List](https://leetcode.com/problems/delete-the-middle-node-of-a-linked-list/)

### Monotonic Stack and Queue
* Next/Previous Greater/Smaller Element
```python
def next_greater_element_backward(nums):
    """
    Finds the next greater element by iterating from the back.
    """
    n = len(nums)
    res = [-1] * n    # Initialize result array
    stack = []        # Will store elements encountered from the right

    # Iterate from n-1 down to 0
    for i in range(n - 1, -1, -1):
        # Pop elements from stack that are smaller or equal to the current element
        # They can't be the NGE for the current or any future elements to the left.
        while stack and nums[i] >= stack[-1]: # Note: storing values here for simplicity
            stack.pop()
        
        # If stack is not empty, its top is the Next Greater Element for nums[i]
        res[i] = stack[-1] if stack else -1
        
        # Push the current element onto the stack for future (leftward) elements to use
        stack.append(nums[i])

    return res

def next_smaller_element(nums):
    n = len(nums)
    res = [-1] * n  # Initialize with -1 (no smaller element)
    stack = []      # Will store indices in increasing order of nums values

    for i in range(n):
        while stack and nums[i] < nums[stack[-1]]:
            idx = stack.pop()
            res[idx] = nums[i]  # Found next smaller element
        stack.append(i)
    
    return res

def previous_greater_element(nums):
    """
    For each element, find the nearest element to the LEFT that is GREATER.
    Returns a list where res[i] is the previous greater element of nums[i],
    or -1 if no such element exists.
    """
    n = len(nums)
    res = [-1] * n    # Initialize result array with -1 (means no previous greater)
    stack = []        # Stack to keep indices of elements, maintaining strictly decreasing order

    for i in range(n):
        # Pop elements from the stack while current element is >= element at stack top
        # because they cannot be previous greater for future elements
        while stack and nums[i] >= nums[stack[-1]]:
            stack.pop()
        
        # If stack is not empty, the top is the index of previous greater element
        res[i] = nums[stack[-1]] if stack else -1
        
        # Push current index to stack to possibly be previous greater for future elements
        stack.append(i)

    return res

def previous_smaller_element(nums):
    """
    For each element, find the nearest element to the LEFT that is SMALLER.
    Returns a list where res[i] is the previous smaller element of nums[i],
    or -1 if no such element exists.
    """
    n = len(nums)
    res = [-1] * n       # Initialize result array with -1 (means no previous smaller)
    stack = []           # Stack to keep indices of elements, maintaining strictly increasing order

    for i in range(n):
        # Pop elements from stack while current element is <= element at top of stack
        # because they cannot be previous smaller for future elements
        while stack and nums[i] <= nums[stack[-1]]:
            stack.pop()
        
        # If stack not empty, top of stack is index of previous smaller element
        res[i] = nums[stack[-1]] if stack else -1
        
        # Push current index for future elements to compare
        stack.append(i)

    return res
```
* In problems like Valid Parenthesis, you can simple take `(` as +1 and `)` as -1, and then if the end summation is 0, then its valid. If anytime it becomes -1, then we can break then an there as now there is a `)` without `(`. Not necessary to have a stack. 
```python
def is_valid_parentheses(s: str) -> bool:
    open_count = 0  # Tracks the net number of unmatched '('

    for char in s:
        if char == '(':
            open_count += 1
        elif char == ')':
            open_count -= 1
            # If at any point open_count is negative, a ')' is unmatched
            if open_count < 0:
                return False

    # At the end, all '(' must be matched by ')'
    return open_count == 0
```
* [Minimum Remove to Make Valid Parenthesis](https://leetcode.com/problems/minimum-remove-to-make-valid-parentheses/)
* [Simplify Path](https://leetcode.com/problems/simplify-path/description/), [Decode String](https://neetcode.io/problems/decode-string/), [Online Stock Span](https://leetcode.com/problems/online-stock-span/), [Astroid Collision](https://leetcode.com/problems/asteroid-collision/) are all same!
* [Basic Calculator](https://leetcode.com/problems/basic-calculator-iii/)
* [Remove Nodes from Linked List](https://leetcode.com/problems/remove-nodes-from-linked-list/description/)
* [Remove k digits](https://leetcode.com/problems/remove-k-digits/) (Constrained monotonic stack)
* [Sliding Window Maximum](https://leetcode.com/problems/sliding-window-maximum/)
* [Largest Rectangle In Histogram](https://leetcode.com/problems/largest-rectangle-in-histogram/description/), [Sum of Subarray Minimums](https://leetcode.com/problems/sum-of-subarray-minimums/), [Maximum Subarray Minimum Product](https://leetcode.com/problems/maximum-subarray-min-product) and [Asteroid Collision](https://leetcode.com/problems/asteroid-collision) all need 2 monotonic stacks.
* [Continuous Subarray](https://leetcode.com/problems/continuous-subarrays/)
### Binary Search
Binary search is used when you need to repeatedly find a value in a sorted array without worrying about removals, or when each query is independent. Apply whenever there is a bounded range and we want to find a given target or min/max (by reducing the search space via lograthmic partitioning of the monotonic answer function's range).
```python
def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = left + (right - left) // 2  # Avoids overflow
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1  # Target not found
```
* The lower bound of target is the index of the first element in arr that is greater than or equal to target. The upper bound of target is the index of the first element in arr that is strictly greater than target. If target is not present, it's the index where target would be inserted to maintain the sorted order. In sorted array, first occurance is `lower bound` and last occurance is `upper bound - 1`. Total number of occurance of an element in sorted array is `(last occurance - first occurance) + 1` = `(upper bound - lower bound)`.
```python

def lower_bound(array, target):
    """
    Returns the smallest index l such that array[l] >= target and array[r] < target
    If all elements are < target, returns len(array).
    """
    left, right = 0, len(array) - 1
    while left <= right:
        mid = (left + right) // 2
        # If mid element is less than target, move left up. We are trying to find first element that is equal to target, after that as well there might be multiple elememts that are target, so we will keep on shifting right pointer but not left, that should be on the first target value
        if array[mid] >= target:
            ans = mid  # Potential answer, but look left for earlier occurrence
            right = mid - 1
        else:
            left = mid + 1
    return ans

def upper_bound(array, target):
    """
    Returns the smallest index r such that array[r] > target and array[l] <= target.
    If all elements are <= target, returns len(array).
    To get the index of the last element <= target, return upper_bound(array, target) - 1
    """
    left, right = 0, len(array) - 1
    ans = len(arr)  # Default to len(arr) if not found
    while left <= right:
        mid = (left + right) // 2
        if array[mid] > target:
            ans = mid  # Potential answer, but look left for earlier occurrence
            right = mid - 1
        else:
            left = mid + 1
    return ans
```
* In binary search on answers, the answer space has to be sorted contiguous array. The check function returns array like [false, false, false, true, true, true...] and the first true (lower bound) is what we are interested in. 
```python
def binary_search_answer(space):
    left, right = 0, len(space)
    while left < right:
        mid = (left + right) // 2
        if check(space[mid]):
            right = mid  # mid might be the first True, so keep it
        else:
            left = mid + 1  # mid is False, need larger
    return left  # index of first True (if any)
```
* [Single Element in Sorted Array](https://leetcode.com/problems/single-element-in-a-sorted-array)
* [Minimum Common Value](https://leetcode.com/problems/minimum-common-value/description/)
* [Longest Common Prefix](https://leetcode.com/problems/longest-common-prefix/)
* [Search in Rotated Sorted Array](https://leetcode.com/problems/search-in-rotated-sorted-array/) 
* [Kth Missing Positive Number](https://leetcode.com/problems/kth-missing-positive-number/)
* [Minimum Time to Complete Trips](https://leetcode.com/problems/minimum-time-to-complete-trips/)
* [Successful Pairs of Spells and Potions](https://leetcode.com/problems/successful-pairs-of-spells-and-potions/)
* [Find K Closest Elements](https://leetcode.com/problems/find-k-closest-elements/) (Binary Search + Two Pointer)
* [Minimum Cost to Make Array Equal](https://leetcode.com/problems/minimum-cost-to-make-array-equal/)
* [Koko Eating Banana](https://leetcode.com/problems/koko-eating-bananas/), [Most Beautiful Item for Each Query](https://leetcode.com/problems/most-beautiful-item-for-each-query/), [Capacity to Ship Package withing D days](https://leetcode.com/problems/capacity-to-ship-packages-within-d-days/), [Split Array Largest Sum](https://leetcode.com/problems/split-array-largest-sum)
* [Maximum Candles Allocated to K Children](https://leetcode.com/problems/maximum-candies-allocated-to-k-children/description/)
* [Minimum Number of Days to make m Bouquets](https://leetcode.com/problems/minimum-number-of-days-to-make-m-bouquets/)
* [Minimum Speed to Arrive in Time](https://leetcode.com/problems/minimum-speed-to-arrive-on-time/description/)
* [Find the Smallest Divisor Given a Threshold](https://leetcode.com/problems/find-the-smallest-divisor-given-a-threshold/description/)
* [Minimize Maximum of Array](https://leetcode.com/problems/minimize-maximum-of-array/) and [Minimize the Maximum Difference of Pairs](https://leetcode.com/problems/minimize-the-maximum-difference-of-pairs)
* [Maximum Running Time of N Computers](https://leetcode.com/problems/maximum-running-time-of-n-computers)
* [Find in Mountain Array](https://leetcode.com/problems/find-in-mountain-array/) 
* [Kth Smallest Element in a Sorted Matrix](https://leetcode.com/problems/kth-smallest-element-in-a-sorted-matrix/description/) 
* [Random Pick with Weight](https://leetcode.com/problems/random-pick-with-weight)

### Recursion and Backtracking
The time and space complexity can be tricky with recursion!
* [Pascal's Triangle](https://leetcode.com/problems/pascals-triangle/)
* [Lexographical Numbers](https://leetcode.com/problems/lexicographical-numbers/)
* [Generate Parenthesis](https://neetcode.io/problems/generate-parentheses/) (both backtracking and DP are of same time and space complexity)
* [Palindrome Partioning](https://leetcode.com/problems/palindrome-partitioning/)
* [Word Search](https://leetcode.com/problems/word-search/)
* [Letter combinations of a phone number](https://leetcode.com/problems/letter-combinations-of-a-phone-number/submissions/1805930456/)
* [Partition to K Equal Sum Subsets](https://leetcode.com/problems/partition-to-k-equal-sum-subsets/)
* [Fair Distribution of Cookies](https://leetcode.com/problems/fair-distribution-of-cookies/)
* [Matchsticks to Squres](https://leetcode.com/problems/matchsticks-to-square/)
* [N-Queens](https://leetcode.com/problems/n-queens/) - [Visualize](https://www.cs.usfca.edu/~galles/visualization/RecQueens.html)

### Greedy
* [Boats to Save People](https://leetcode.com/problems/boats-to-save-people/description/?envType=daily-question&envId=2024-05-04), [Bag of Tokens](https://leetcode.com/problems/bag-of-tokens/), [Maximize Greatness of Array](https://leetcode.com/problems/maximize-greatness-of-an-array/description/)
* [Merge Intervals](leetcode.com/problems/merge-intervals/description/), [Non Overlapping Intervals](https://leetcode.com/problems/non-overlapping-intervals/), [the whole series of Jump Game](https://leetcode.com/problems/jump-game-vi/description/) or [Minimum Number of Taps to Open to a Water Garden](https://leetcode.com/problems/minimum-number-of-taps-to-open-to-water-a-garden/), [Maximum Number of Evenets that can be Attended](https://leetcode.com/problems/maximum-number-of-events-that-can-be-attended-ii/description/)
* [Frequency of the most frequent elements](https://leetcode.com/problems/frequency-of-the-most-frequent-element/) (Sliding wondow +Greedy more intutive than using Binary Search + Prefix sum)
* [Smallest Subsequence of Distinct Characters](https://leetcode.com/problems/smallest-subsequence-of-distinct-characters/) or [Remove Duplicate Letters](https://leetcode.com/problems/remove-duplicate-letters/description/), [Remove K Digits](https://leetcode.com/problems/remove-k-digits/) or [Find the Most Competetive Subsequence](https://leetcode.com/problems/find-the-most-competitive-subsequence/), [Create Maximum Number](https://leetcode.com/problems/create-maximum-number/) (geedy Monotonic Stack)
* [Meeting Rooms II](leetcode.com/problems/meeting-rooms-ii/), [Course Schedule III](https://leetcode.com/problems/course-schedule-iii/description/), [Furthest Building You Can Reach](https://leetcode.com/problems/furthest-building-you-can-reach), [Maximum Performance of a Team](https://leetcode.com/problems/maximum-performance-of-a-team/) - greedy with heap
* Huffman Coding
```python
import heapq
from collections import defaultdict, Counter

class HuffmanNode:
    def __init__(self, freq, char=None, left=None, right=None):
        self.freq = freq          # Frequency of the character(s)
        self.char = char          # Character stored (None for internal nodes)
        self.left = left          # Left child
        self.right = right        # Right child

    # For heapq to sort nodes by frequency
    def __lt__(self, other):
        return self.freq < other.freq

def build_huffman_tree(char_freq):
    """
    Build Huffman tree from character frequencies.
    Returns the root of the Huffman tree.
    """
    min_heap = []

    # Initialize the heap with leaf nodes for each character
    for char, freq in char_freq.items():
        heapq.heappush(min_heap, HuffmanNode(freq, char))
    
    # Combine nodes until single tree remains
    while len(min_heap) > 1:
        # Pop two nodes with smallest freq
        left = heapq.heappop(min_heap)
        right = heapq.heappop(min_heap)

        # Merge these nodes into a new internal node
        merged = HuffmanNode(left.freq + right.freq, None, left, right)
        heapq.heappush(min_heap, merged)
    
    # The remaining node is the root of the Huffman tree
    return min_heap[0] if min_heap else None

def build_huffman_codes(root):
    """
    Traverse the Huffman tree to build a dictionary of character->code mappings.
    """
    huffman_codes = {}

    def dfs(node, code):
        if node is None:
            return
        # If leaf node
        if node.char is not None:
            huffman_codes[node.char] = code if code else "0"  # handle single char edge case
            return
        # Traverse left adds "0", right adds "1"
        dfs(node.left, code + "0")
        dfs(node.right, code + "1")

    dfs(root, "")
    return huffman_codes

def huffman_encode(text):
    """
    Encode the input text using Huffman coding.
    Returns the encoded string and the Huffman tree root for decoding.
    """
    # Count frequency of each character
    char_freq = Counter(text)

    # Build Huffman tree
    root = build_huffman_tree(char_freq)

    # Build codes by traversing the tree
    codes = build_huffman_codes(root)

    # Encode the text using code map
    encoded_text = "".join(codes[ch] for ch in text)

    return encoded_text, root

def huffman_decode(encoded_text, root):
    """
    Decode the encoded text using the Huffman tree.
    Returns the original text string.
    """
    decoded_chars = []
    current = root
    for bit in encoded_text:
        # Traverse tree per bit
        if bit == "0":
            current = current.left
        else:
            current = current.right
        
        # On reaching leaf node, append character and restart from root
        if current.char is not None:
            decoded_chars.append(current.char)
            current = root
    
    return "".join(decoded_chars)
```

### Tree
```python
"""
The inner for loop is only needed if you want to group nodes by level; otherwise, a single while loop is sufficient for standard BFS traversal.
"""
def bfs(root):
        if not root:
            return []
        
        result = []
        # We enqueue child nodes at the back.
        # We dequeue nodes from the front to process them level by level.
        queue = deque([root]) # queue = [1]
        level_sum = 0 # when its never reset, it gives sum of all nodes in binary tree
        
        # each iteration of while loop is one level
        while queue:
            level = []
            level_sum = 0 # reset sum at each level, so last level sum is of deepest layer
            level_size = len(queue)
            
            # each iteration of for loop is for nodes at each level
            for _ in range(level_size):
                node = queue.popleft()
                level.append(node.val)
                level_sum += node.val
                
                if node.left:
                    queue.append(node.left)
                if node.right:
                    queue.append(node.right)
            
            result.append(level)
        return result
    
    # Iteration 1 (Level 0):
    # - level_size = 1
    # - Process node 1:
    #     * Add 1 to current level
    #     * Add children (2,3) to queue
    # - After iteration: 
    #     * queue = [2,3]
    #     * result = [[1]]
    
    # Iteration 2 (Level 1):
    # - level_size = 2
    # - Process node 2:
    #     * Add 2 to current level
    #     * Add children (4,5) to queue
    # - Process node 3:
    #     * Add 3 to current level
    #     * Add child (6) to queue
    # - After iteration:
    #     * queue = [4,5,6]
    #     * result = [[1], [2,3]]
    
    # Iteration 3 (Level 2):
    # - level_size = 3
    # - Process nodes 4,5,6:
    #     * Add 4,5,6 to current level
    #     * No children to add
    # - After iteration:
    #     * queue = []
    #     * result = [[1], [2,3], [4,5,6]]
    
    # Final result: [[1], [2,3], [4,5,6]]
    
    # Time: O(n) - visit each node once
    # Space: O(w) - where w is max width of tree
```
```python
# Left -> Root -> Right (Sorted for BST)
def inorder(node: TreeNode) -> List[int]:
            if not node:
                return []
            return inorder(node.left) + [node.val] + inorder(node.right)
        return inorder(root)

# Root -> Left -> Right
def preorder(node: TreeNode) -> List[int]:
            if not node:
                return []
            return [node.val] + preorder(node.left) + preorder(node.right)
        return preorder(root)

# 
def postorder(node: TreeNode) -> List[int]:
            if not node:
                return []
            return postorder(node.left) + postorder(node.right) + [node.val]
        return postorder(root)
```
* Height of Binary Tree
```python
def height(root):
    if root is None:
        return 0  # Height of empty tree is 0 (sometimes defined as -1)
    left_height = height(root.left)
    right_height = height(root.right)
    return max(left_height, right_height) + 1
```
* [Inorder + Preorder => Unique tree](https://leetcode.com/problems/construct-binary-tree-from-preorder-and-inorder-traversal); [Inorder + Postorder => Unique tree](https://leetcode.com/problems/construct-binary-tree-from-inorder-and-postorder-traversal); [Postorder + Preorder => Multiple Trees possible](https://leetcode.com/problems/construct-binary-tree-from-preorder-and-postorder-traversal/), [Maximum Binary Tree](https://leetcode.com/problems/maximum-binary-tree/description/) and [Flatten Binary Tree to LinkedList](https://leetcode.com/problems/flatten-binary-tree-to-linked-list/)
* [Diameter of Tree](https://leetcode.com/problems/diameter-of-binary-tree/description/) 
* [Subtree of Another Tree](https://leetcode.com/problems/subtree-of-another-tree/)
* [Binary Tree Zigzag Level Order Traversal](https://leetcode.com/problems/binary-tree-zigzag-level-order-traversal)
* [Find Leaves of Binary Tree](https://leetcode.com/problems/find-leaves-of-binary-tree/description/), [Delete Leaves With a Given Value](https://leetcode.com/problems/delete-leaves-with-a-given-value/) and [Deepest Leaves Sum](https://leetcode.com/problems/deepest-leaves-sum/description/)
* [Maximum Width of Tree](https://leetcode.com/problems/maximum-width-of-binary-tree/)
* [Minimum Number of Operations to Sort a Binary Tree by Level](https://leetcode.com/problems/minimum-number-of-operations-to-sort-a-binary-tree-by-level)
* [Count Good Nodes in Binary Tree](https://leetcode.com/problems/count-good-nodes-in-binary-tree/description/) and [Count Nodes Equal to Average of Subtree](https://leetcode.com/problems/count-nodes-equal-to-average-of-subtree/)
* [Add One Row at a given Level in a binary Tree](https://leetcode.com/problems/add-one-row-to-tree/)
* Boundary Traversal
```python
def boundary_traversal(root: TreeNode) -> List[int]:
        """
        Boundary Traversal of Binary Tree
        
        Intuition:
        - Traverse tree boundary in anti-clockwise direction
        - Three parts: left boundary, leaves, right boundary
        - Need to avoid duplicate nodes
        
        Algorithm steps:
        1. Add root
        2. Add left boundary (excluding leaves)
        3. Add leaves from left to right
        4. Add right boundary (excluding leaves) in reverse
        
        Helper functions:
        - add_left_boundary: Adds nodes on leftmost path
        - add_leaves: Adds all leaf nodes
        - add_right_boundary: Adds nodes on rightmost path (bottom-up)
        
        Use cases:
        1. Printing tree perimeter
        2. Finding external nodes
        3. Tree visualization
        
        Time: O(n), Space: O(h) where h is height of tree
        """
        def add_left_boundary(node: TreeNode, result: List[int]):
            if not node or (not node.left and not node.right):
                return
            result.append(node.val)
            if node.left:
                add_left_boundary(node.left, result)
            elif node.right:
                add_left_boundary(node.right, result)
        
        def add_leaves(node: TreeNode, result: List[int]):
            if not node:
                return
            if not node.left and not node.right:
                result.append(node.val)
                return
            add_leaves(node.left, result)
            add_leaves(node.right, result)
        
        def add_right_boundary(node: TreeNode, result: List[int]):
            if not node or (not node.left and not node.right):
                return
            if node.right:
                add_right_boundary(node.right, result)
            elif node.left:
                add_right_boundary(node.left, result)
            result.append(node.val)
        
        if not root:
            return []
        
        result = [root.val]
        if not root.left and not root.right:
            return result
        
        if root.left:
            add_left_boundary(root.left, result)
        add_leaves(root.left, result)
        add_leaves(root.right, result)
        if root.right:
            add_right_boundary(root.right, result)
        
        return result
```
* [House Robber](https://leetcode.com/problems/house-robber/)
* The total number of paths between any two nodes in a binary tree with n nodes is n×(n−1) ​/2 as for each starting node, there are n−1 other nodes in the tree to which it can connect, forming n−1 paths. [Longest Univalue Path](https://leetcode.com/problems/longest-univalue-path/description/), [Path Sum](https://leetcode.com/problems/path-sum-iii/description/) and [Maximum Path Sum](https://leetcode.com/problems/binary-tree-maximum-path-sum/description/)
* [Maximum Product of Splitted Binary Tree](https://leetcode.com/problems/maximum-product-of-splitted-binary-tree/description/)
* Distance between 2 Nodes
```python
def lowestCommonAncestor(self, root: TreeNode, node1: TreeNode, node2: TreeNode) -> TreeNode:
        """
        Recursively finds the lowest common ancestor (LCA) of node1 and node2 in the binary tree.
        """
        if not root or root == node1 or root == node2:
            return root

        left_subtree = self.lowestCommonAncestor(root.left, node1, node2)
        right_subtree = self.lowestCommonAncestor(root.right, node1, node2)

        if left_subtree and right_subtree:
            return root  # current node is LCA if node1 and node2 are found in left and right
        return left_subtree if left_subtree else right_subtree

    def findDepthFromAncestor(self, ancestor: TreeNode, target: TreeNode, current_depth: int = 0) -> int:
        """
        Finds the depth of the target node starting from the ancestor node.
        Returns -1 if the target is not found in the subtree rooted at ancestor.
        """
        if not ancestor:
            return -1
        if ancestor == target:
            return current_depth

        # Search left subtree
        left_depth = self.findDepthFromAncestor(ancestor.left, target, current_depth + 1)
        if left_depth != -1:
            return left_depth

        # Search right subtree
        return self.findDepthFromAncestor(ancestor.right, target, current_depth + 1)

    def distanceBetweenNodes(self, root: TreeNode, node1: TreeNode, node2: TreeNode) -> int:
        """
        Computes the distance (number of edges) between node1 and node2 in a binary tree.
Time - O(n) and Space - O(h)
        """
        # Step 1: Find LCA of the two nodes
        lca = self.lowestCommonAncestor(root, node1, node2)

        # Step 2: Find depth of each node from the LCA
        depth1 = self.findDepthFromAncestor(lca, node1)
        depth2 = self.findDepthFromAncestor(lca, node2)

        # Step 3: Distance = depth1 + depth2
        return depth1 + depth2
```
* [Insufficient Nodes in Root to Leaf Paths](https://leetcode.com/problems/insufficient-nodes-in-root-to-leaf-paths/)
* [Maximum Difference between Node and Ancestor](https://leetcode.com/problems/maximum-difference-between-node-and-ancestor/)
* [Count Complete Tree Nodes](https://leetcode.com/problems/count-complete-tree-nodes/description/)
* [N-ary Tree Level Order Traversal](https://leetcode.com/problems/n-ary-tree-level-order-traversal/) and [Maximum Depth of N-ary Tree](https://leetcode.com/problems/maximum-depth-of-n-ary-tree/)
* [Construct Quad Tree](https://leetcode.com/problems/construct-quad-tree/)
* In a balanced BST, operations like search, insert, and delete run in average and best-case O(log⁡n) time; in the worst (unbalanced), these degrade to O(n). BSTs are the basis for self-balancing trees (e.g., AVL, Red-Black), which maintain the O(log⁡n) guarantee in all cases.
* Inorder Traversal is sorted in ascending order for BST. Reverse inorder traversal (R->V->L) gives descending order. Exploit in cases of >= or <= problems in BST. 
* [Lowest Common Ancestor in BST](https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-search-tree)
* [Search in BST](https://leetcode.com/problems/search-in-a-binary-search-tree) and [Balance BST](https://leetcode.com/problems/balance-a-binary-search-tree/description/)
* [Range Sum of BST](https://leetcode.com/problems/range-sum-of-bst/) 
* Insert and Delete Node in BST
```python
def insertIntoBST(self, root: TreeNode, val: int) -> TreeNode:
        # If the tree is empty, create a new node with the value and return it
        if not root:
            return TreeNode(val)
        
        # If the value is less than the current node, go to the left subtree
        if val < root.val:
            root.left = self.insertIntoBST(root.left, val)
        else:
            # If the value is greater than or equal to the current node, go to the right subtree
            root.right = self.insertIntoBST(root.right, val)
        
        # Return the root as the tree structure is updated bottom-up
        return root

def deleteNode(self, root: Optional[TreeNode], key: int) -> Optional[TreeNode]:
        if not root:
            return root

        if key > root.val:
            root.right = self.deleteNode(root.right, key)
        elif key < root.val:
            root.left = self.deleteNode(root.left, key)
        else:
            if not root.left:
                return root.right
            elif not root.right:
                return root.left

            cur = root.right
            while cur.left:
                cur = cur.left
            root.val = cur.val
            root.right = self.deleteNode(root.right, root.val)

        return root
```
* [kth smallest element in BST](https://leetcode.com/problems/kth-smallest-element-in-a-bst)
* [BST to sorted DLL](https://leetcode.com/problems/convert-binary-search-tree-to-sorted-doubly-linked-list/description/)
* [Minimum Absolute Difference in BST](https://leetcode.com/problems/minimum-absolute-difference-in-bst/)
* [Serialize and Deserialize Binary Tree](https://leetcode.com/problems/serialize-and-deserialize-binary-tree/)
* [N-ary Tree Level Order Traversal](https://leetcode.com/problems/n-ary-tree-level-order-traversal/)
### Heap
* [Top K frequent elements](https://leetcode.com/problems/top-k-frequent-elements/description/) (Bucket Sort)
* [Find K pair with smallest sums](https://leetcode.com/problems/find-k-pairs-with-smallest-sums/)
* [Task Scheduler](https://leetcode.com/problems/task-scheduler/)
* [Find Median from Data Stream](https://leetcode.com/problems/find-median-from-data-stream/)
* [Total Cost to Hire K Workers](https://leetcode.com/problems/total-cost-to-hire-k-workers/description/)
* [Reorganize String](https://leetcode.com/problems/reorganize-string/)
### Trie/Prefix Tree
```python

```

### Graphs
* Adjaceny list 
If the input is a list of lists and each index represents a node and its neighbors, You do not need to build an adjacency list. If the input is a list of lists, but each list is not directly the neighbors of a node, then build the adjacency list.
```python
"""
For example, in the Bus Routes problem:

    Input: routes = [[1][2][7],[3][6][7]]

    Each sublist is a bus route, not a node's neighbors.

    You need to build a mapping from each bus stop to the routes that visit it, or from each route to the stops it connects, depending on your traversal strategy.
"""
routes = [[1,2,7],[3,6,7]]
stop_to_routes = defaultdict(list)
for i, route in enumerate(routes):
    for stop in route:
        stop_to_routes[stop].append(i)
# stop_to_routes: {1: [0], 2: [0], 7: [0, 1], 3: [1], 6: [1]}
```
* Standard Algorithms
```python
"""
BFS naturally processes nodes in increasing “distance” (layers) from starting node/root. Want minimum/smallest “number of moves” to reach something? BFS is ideal if all moves have the same cost.
"""
def bfs(graph, start):
        """Breadth-First Search
           Time Complexity - O(n) + O(2e)
           Space Complexity - O(n)
        """
        visited = set()
        queue = deque([start])
        visited.add(start)
        result = []
        
        while queue:
            vertex = queue.popleft()
            result.append(vertex)
            
            for neighbor in graph[vertex]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        return result
```
```python
"""
When all ways must be explored, or the visitor order matters. 
"""
def dfs(graph, start, visited=None, result=None):
    if visited is None:
        visited = set()
    if result is None:
        result = []
    
    visited.add(start)
    result.append(start)
    
    for neighbor in graph[start]:
        if neighbor not in visited:
            dfs(graph, neighbor, visited, result)
    
    return result
```
* Cycle Detection 
```python
def undirected_has_cycle_dfs(graph):
"""
Each DFS call tracks the parent to avoid falsely detecting the immediate back edge as a cycle.
The outer loop ensures all connected components are checked.
Time Complexity - O(n)
Space Complexity - O(n + 2e)
"""
    visited = set()

    def dfs(node, parent):
        visited.add(node)
        for neighbor in graph.get(node, []):
            if neighbor not in visited:
                if dfs(neighbor, node):
                    return True
            elif neighbor != parent:
                # Found a cycle
                return True # no need for more recursion after cycle is already detected
        return False

    # Handle disconnected components
    for node in graph:
        if node not in visited: # one node per component
            if dfs(node, None):
                return True
    return False
```
```python
from collections import deque

def undirected_has_cycle_bfs(graph):
    """    
Each BFS node tracks its parent to avoid confusing the edge back to the parent as a cycle.
The outer loop ensures all components are checked, even if the graph is disconnected.
    """
    visited = set()

    for start in graph:
        if start not in visited:
            queue = deque([(start, None)])  # (current_node, parent)
            visited.add(start)
            while queue:
                node, parent = queue.popleft()
                for neighbor in graph.get(node, []):
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append((neighbor, node))
                    elif neighbor != parent:
                        # Found a back edge (cycle)
                        return True
    return False
```
```python
from collections import defaultdict

class Solution:
    def detectCycleInDirectedGraph(self, V: int, adj: list[list[int]]) -> bool:
        """
        Detects if a directed graph contains a cycle using DFS.

        Args:
            V: The number of vertices in the graph.
            adj: An adjacency list representation of the graph.
                 adj[i] contains a list of neighbors of vertex i.

        Returns:
            True if a cycle is detected, False otherwise.
        """
        # visited array: This array keeps track of all nodes that have been part of any DFS traversal at some point. Once a node is marked visited, it means we've explored it from at least one path. This prevents redundant processing of nodes and helps optimize the traversal.
        # visited[i] = True if node i has been visited in any DFS traversal.
        visited = [False] * V

        # path_visited array: This is the key for cycle detection in a directed graph. It keeps track of all nodes that are currently in the current recursion stack of the DFS traversal. If we encounter a node that is already in our path_visited array, it means we've found a back edge, which indicates a cycle. Think of it as: "I'm currently exploring this path, and I just tried to go to a node I've already visited on this exact path.
        # path_visited[i] = True if node i is currently in the recursion stack.
        path_visited = [False] * V

        # The DFS helper function
        def dfs(node: int) -> bool:
            """
            Performs DFS starting from 'node' to detect cycles.

            Args:
                node: The current node being visited.

            Returns:
                True if a cycle is detected starting from this node's path, False otherwise.
            """
            visited[node] = True      # Mark current node as globally visited
            path_visited[node] = True # Mark current node as part of the current path

            # Explore all neighbors of the current node
            for neighbor in adj[node]:
                if not visited[neighbor]:
                    # If neighbor is not visited, recursively call DFS
                    if dfs(neighbor):
                        # If a cycle is detected in the subtree, propagate True upwards
                        return True
                elif path_visited[neighbor]:
                    # If neighbor is already in the current recursion stack (path_visited is True),
                    # it means we found a back edge, hence a cycle.
                    return True

            # Backtrack: Remove the current node from the current path
            # as we are done exploring all paths from this node.
            path_visited[node] = False
            return False # No cycle found from this node's path

        # Iterate through all nodes to handle disconnected components
        for i in range(V):
            if not visited[i]:
                # If a node hasn't been visited, start a new DFS traversal
                if dfs(i):
                    # If DFS from this node finds a cycle, return True immediately
                    return True

        # No cycle found after checking all components
        return False
```
* Topological Sort
```python
"""
For each vertex, we iterate through its outgoing edges. Thus, every vertex and every edge in the graph is processed exactly once. This leads to O(V+E) for the DFS part. adj (Adjacency List): O(V+E) to store the graph connections, visited_state array: O(V) space, result list: O(V) space to store the topological order, Recursion Stack: In the worst-case scenario (a linear graph, e.g., 0 -> 1 -> 2 -> ... -> V-1), the depth of the recursion stack can go up to O(V).

0 (UNVISITED): The node has not been encountered at all by any DFS traversal.

1 (VISITING / IN_STACK): The node has been visited, and it is currently in the active recursion stack of the current DFS path. This means we are currently exploring its descendants.

2 (VISITED / PROCESSED): The node has been completely processed. Its DFS traversal (and all of its reachable descendants) has finished, and it has been added to the topological sort result.
"""
def _dfs(self, node: int):
        """
        Recursive DFS helper function for topological sort and cycle detection.
        """
        if self.has_cycle:
            # If a cycle has already been detected, stop further processing
            return

        # Mark the current node as VISITING (in recursion stack)
        self.visited_state[node] = 1

        # Explore all neighbors of the current node
        for neighbor in self.adj[node]:
            if self.visited_state[neighbor] == 0:
                # If neighbor is UNVISITED, recursively call DFS on it
                self._dfs(neighbor)
                if self.has_cycle: # Propagate cycle detection upwards
                    return
            elif self.visited_state[neighbor] == 1:
                # If neighbor is VISITING, it means we found a back edge,
                # hence a cycle exists in the graph.
                self.has_cycle = True
                return
        
        # After visiting all neighbors and ensuring no cycle, mark current node as VISITED
        self.visited_state[node] = 2
        
        # Add the current node to the result list.
        # Nodes are added when all their descendants (dependencies) have been processed.
        # This naturally builds the list in reverse topological order.
        self.result.append(node)

    def topological_sort(self) -> list[int]:
        """
        Performs topological sort on the graph.
        
        Returns:
            A list representing a valid topological order if one exists.
            An empty list if a cycle is detected (no valid order).
        """
        self.result = [] # Reset result for new sort attempts
        self.has_cycle = False
        self.visited_state = [0] * self.num_nodes # Reset visited states

        # Iterate through all nodes to handle disconnected components in the graph
        for i in range(self.num_nodes):
            if self.visited_state[i] == 0: # If node is unvisited, start a new DFS
                self._dfs(i)
                if self.has_cycle:
                    # If a cycle is detected during any DFS call, return empty list
                    return []
        
        # If no cycle was found, reverse the result list to get the correct topological order.
        # The DFS appends nodes after all their descendants are processed, so the
        # sink nodes are added first. Reversing puts source nodes first.
        return self.result[::-1]
```
* Dijkstra
```python
def dijkstra(graph, start):
        """Dijkstra's shortest path algorithm"""
        distances = {vertex: float('infinity') for vertex in graph}
        distances[start] = 0
        pq = [(0, start)]
        visited = set()
        
        while pq:
            current_distance, current_vertex = heapq.heappop(pq)
            
            if current_vertex in visited:
                continue
                
            visited.add(current_vertex)
            
            for neighbor, weight in graph[current_vertex].items():
                distance = current_distance + weight
                
                if distance < distances[neighbor]:
                    distances[neighbor] = distance
                    heapq.heappush(pq, (distance, neighbor))
        
        return distances
```
* [Bus Routes](https://leetcode.com/problems/bus-routes) and [Detonate the Maximum Bombs](https://leetcode.com/problems/detonate-the-maximum-bombs/description/)
* [Pacific Atlantic Water Flow](https://leetcode.com/problems/pacific-atlantic-water-flow/description/), [Number of Enclaves](https://leetcode.com/problems/number-of-enclaves/), [Count Sub Islands](https://leetcode.com/problems/count-sub-islands/)
* [Shortest Bridge](https://leetcode.com/problems/shortest-bridge/description/)
* [Course Schedular](https://leetcode.com/problems/course-schedule/)
* [Possible Bipartition](https://leetcode.com/problems/possible-bipartition/description/)
* [All Nodes Distance K in Binary Tree](https://leetcode.com/problems/all-nodes-distance-k-in-binary-tree/) and [Sum of Distances in Tree](https://leetcode.com/problems/sum-of-distances-in-tree/description/)
* [Cheapest Flights Within K Stops](https://leetcode.com/problems/cheapest-flights-within-k-stops/)
* [Reorder Routes to Make All Paths Lead to the City Zero](https://leetcode.com/problems/reorder-routes-to-make-all-paths-lead-to-the-city-zero/)
* An hard to find graph pattern is used in these problems - Word Ladder I/II, [Minimum Genetic Mutation](https://leetcode.com/problems/minimum-genetic-mutation/), [Open the Lock](https://leetcode.com/problems/open-the-lock/), [Lexicographically Smallest String after Applying Operations](https://leetcode.com/problems/lexicographically-smallest-string-after-applying-operations/), etc. Generally a number/word will be given, and each digit/character can be changed in some way, and we have to reach the target number/word in minimum steps/moves/operations or to find something during the journey of changing like max/min values. Compulsarily, this will lead to finite number of states. Use BFS (shortest path) or DFS for traversals.
* Union-Find (Disjoint Set Union)

### Matrix
* [Spiral Matrix](https://leetcode.com/problems/spiral-matrix)
* [Number of Islands](https://leetcode.com/problems/number-of-islands/)
* [Rat in a Maze](https://www.geeksforgeeks.org/problems/rat-in-a-maze-problem/1) 
* Minimum square to fit N rectangles
```python
"""
For any candidate size XX, you can check in O(1)O(1) whether all nn rectangles fit by seeing how many can fit along the width and along the height:
    max_rects=⌊X/w⌋×⌊X/h⌋
As X increases, max_rects also increases (monotonically).
The property: "can fit at least n rectangles" transitions from False (when X is too small) to True as X increases.
"""
# Function to check if side of square X
# can pack all the N rectangles or not
def bound(w, h, N, x):

    # Find the number of rectangle
    # it can pack
    val = (x//w)*(x//h)
    
    # If val is atleast N,
    # then return true
    if(val >= N):
        return True
      
    # Otherwise, return false
    else:
        return False

# Function to find the size of the
# smallest square that can contain
# N rectangles of dimensions W * H
def FindSquare(N, W, H):

    # Stores the lower bound
    ileft = 1
    
    # Stores the upper bound
    right = (W * H) * N
    
    # Iterate until i is less than j
    while(left < right):
      
        # Calculate the mid value
        mid = left + (right - left)//2

        # If the current size of square can contain N rectangles
        if(bound(W, H, N, mid)):
            right = mid
        
        # Otherwise, update i
        else:
            left = mid + 1

    # Return the minimum size of the square required
    return right
```
* [Search a 2D Matrix](https://leetcode.com/problems/search-a-2d-matrix/) and [Search a 2D Matrix II](https://leetcode.com/problems/search-a-2d-matrix-ii/) with a simpler version [Count Negative Numbers in a Sorted Matrix](https://leetcode.com/problems/count-negative-numbers-in-a-sorted-matrix/description/)
* [Find Safest Path in Grid](https://leetcode.com/problems/find-the-safest-path-in-a-grid/description/) (Dijkstra's algorithm is tricky here, Binary Search + multi-source BFS is optimal)
* [Rotten Oranges](https://leetcode.com/problems/rotting-oranges/)
* [01 Matrix](https://leetcode.com/problems/01-matrix/)
* [Tic Tac Toe](https://leetcode.com/problems/design-tic-tac-toe/) (Winning Conditions and Board State)
```python
class TicTacToe:
    def __init__(self, n: int):
        self.n = n
        self.rows = [0] * n
        self.cols = [0] * n
        self.diag = 0
        self.anti_diag = 0

"""
Time - O(1) per move 
Space - O(N)
"""

    def move(self, row: int, col: int, player: int) -> int:
        value = 1 if player == 1 else -1

        self.rows[row] += value
        self.cols[col] += value
        
        if row == col:
            self.diag += value
        if row + col == self.n - 1:
            self.anti_diag += value

        if (abs(self.rows[row]) == self.n or 
            abs(self.cols[col]) == self.n or 
            abs(self.diag) == self.n or 
            abs(self.anti_diag) == self.n):
            return player
        
        return 0  # No winner yet

```
* [Shortest path in matrix with Obstacles](https://leetcode.com/problems/shortest-path-in-a-grid-with-obstacles-elimination/)
* [Sudoku solving](https://leetcode.com/problems/sudoku-solver/) (Backtracking with constraints)
* [N-queens](https://leetcode.com/problems/n-queens/) (Backtracking with column AND diagonal tracking)
* [Number of Distinct Islands](https://leetcode.com/problems/number-of-distinct-islands/description/)
```python
class Solution:
    def numDistinctIslands(self, grid: list[list[int]]) -> int:
        m, n = len(grid), len(grid[0])
        
        # A set to store the unique shapes of islands.
        # We'll store shapes as frozensets of relative coordinates (tuples).
        distinct_islands = set()
        
        # 8 Directions for DFS:
        # (dr, dc)
        # Horizontal: (0, 1), (0, -1)
        # Vertical:   (1, 0), (-1, 0)
        # Diagonal:   (1, 1), (1, -1), (-1, 1), (-1, -1)
        # directions = [
        #     (0, 1), (0, -1),  # Right, Left
        #     (1, 0), (-1, 0),  # Down, Up
        #     (1, 1), (1, -1),  # Down-Right, Down-Left
        #     (-1, 1), (-1, -1) # Up-Right, Up-Left
        # ]

        # Generate 8 directions using nested loops
        # dr will go from -1, 0, 1 (for up, current row, down)
        # dc will go from -1, 0, 1 (for left, current col, right)
        # We exclude (0, 0) as that's the current cell itself.
        directions = []
        for dr in range(-1, 2):
            for dc in range(-1, 2):
                if dr == 0 and dc == 0:
                    continue # Skip the current cell itself
                directions.append((dr, dc))

        # DFS helper function to explore an island and record its shape
        def dfs(r: int, c: int, island_shape: list, row_offset: int, col_offset: int):
            # Mark the current cell as visited by changing it from 1 to 0
            grid[r][c] = 0 # Change land to water (or a distinct visited marker)
            
            # Add the relative coordinates of the current cell to the island_shape list
            # Normalized relative to the top-leftmost point of the island.
            island_shape.append((r - row_offset, c - col_offset))
            
            # Explore neighbors in all 8 directions
            for dr, dc in directions:
                nr, nc = r + dr, c + dc
                
                # Check bounds and if it's an unvisited land cell
                if 0 <= nr < m and 0 <= nc < n and grid[nr][nc] == 1:
                    dfs(nr, nc, island_shape, row_offset, col_offset)

        # Iterate through the grid to find islands
        for r in range(m):
            for c in range(n):
                if grid[r][c] == 1: # Check if it's land
                    # Found a new island, start DFS from here
                    current_island_shape = []
                    # Pass the starting coordinates as offsets to normalize future coordinates
                    dfs(r, c, current_island_shape, r, c)
                    
                    # Add the unique shape (as a frozenset for immutability) to our set
                    # Using frozenset handles cases where the points might be visited
                    # in different orders but represent the same shape.
                    # If maintaining a specific order within the shape is crucial (e.g., for
                    # a path-based signature), then sorting current_island_shape and then
                    # converting to a tuple would be more appropriate:
                    # current_island_shape.sort()
                    # distinct_islands.add(tuple(current_island_shape))
                    distinct_islands.add(frozenset(current_island_shape))
        
        return len(distinct_islands)
```

### Dynamic Programming
* [Word Break](https://leetcode.com/problems/word-break) and [Check if There is a Valid Partition For The Array](https://leetcode.com/problems/check-if-there-is-a-valid-partition-for-the-array)
* [Palindromic Substrings](https://leetcode.com/problems/palindromic-substrings/)
* [Decode Ways](https://leetcode.com/problems/decode-ways/)
* [All Possible Full Binary Tree](https://leetcode.com/problems/all-possible-full-binary-trees/description/) and [Binary Tree Camera](https://leetcode.com/problems/binary-tree-cameras/description/)
* [Edit Distance](https://leetcode.com/problems/edit-distance/description/)
* [Longest Common Subsequence](https://leetcode.com/problems/longest-common-subsequence/description/) - [Visualize](https://www.cs.usfca.edu/~galles/visualization/DPLCS.html)
* [Longest Increasing Subsequence](https://leetcode.com/problems/longest-increasing-subsequence/) and [Longest String Chain](https://leetcode.com/problems/longest-string-chain)
* [Best Time to Buy and Sell Stock limited to K Transactions](https://leetcode.com/problems/best-time-to-buy-and-sell-stock-iv/description/)
* [Unique BST](https://leetcode.com/problems/unique-binary-search-trees/)
* [Daily Temperature](https://leetcode.com/problems/daily-temperatures/)
* [Maximum Profit in Job Scheduling](https://leetcode.com/problems/maximum-profit-in-job-scheduling/) 
* [Tapping Rain Water](https://leetcode.com/problems/trapping-rain-water/description/) (two-pointer is better than DP)
* [Predict the Winner](https://leetcode.com/problems/predict-the-winner/) (greedy doesnt work)
* [Frog Jump](https://leetcode.com/problems/frog-jump/description/) and Longest Arithmetic Subsequence
* [Tallest Billboard](https://leetcode.com/problems/tallest-billboard/description/) (meet-in-the-middle)
* [Painting the Walls](https://leetcode.com/problems/painting-the-walls/description/) (DP instead of greedy)
* [Make Array Strictly Increasing](https://leetcode.com/problems/make-array-strictly-increasing) (DP + Greedy)
* [Cherry Pickup](https://leetcode.com/problems/cherry-pickup)
* [Substring with Largest Variance](https://leetcode.com/problems/substring-with-largest-variance)

> Don't underestimate easy topics. Generally Dynamic Programming and Advanced Graphs are not asked much in interviews. Just know the basics really well, and rest you can manage in the interview. There is always a sprinkle of luck involved in the process. 

### Impractical Stuff

If I ever take interviews, I wont ask Hard Leetcode questions. They are mostly impractical for any Senior Engineer with a day-job and a family ( º﹃º ). I am even crazier, I would ask the candidate to build a Iterator or some applied Data Structure problem, any basic thing that's used in day-to-day job just to check ability to fight through a problem. And that would cover most relevant Data Structures and Algorithms concepts. Even LeetCode has some interesting questions like :

* Design HashMap and HashSet
* Design Twitter
* Design Add and Search Words Data Structure
* Design Hit Counter
* LFU and LRU Cache
* Design Circular Queue
* Insert Delete GetRandom O(1)
* Time Based Key-Value Store
* Single-Threaded CPU
* Design Browser History
* [Time Taken to Cross the Door](https://leetcode.com/problems/time-taken-to-cross-the-door)

### OOPs

When only one instance of a class is required, we use a Singleton Class. For this, we make the constructor private. Clarity over OOPs concepts is crucial. The Pillars of OOPs are like Tight and Loose Coupling, Inheritance and Composition, Abstract Classes and Interfaces, Diamond Problem, Dependency Injection, Registery pattern, etc/
* Data Abstraction - hide the internal implementation, expose only the essential functionality. Achieved via Interface and Abstract Classes
* Data Encapsulation - Classes bundle the data with its corresponsing code

# Low-Level Design

This round primarily focuses on SOLID, DRY, KISS, OOPs, [Design Patterns](https://www.youtube.com/playlist?list=PLrhzvIcii6GNjpARdnO4ueTUAVR9eMBpc) and the overall modularity, maintainability and testability of the code. 

The best way to master LLD is to write good code in your day job ;)
When desiging the business component, the LLD matters the most. If the code is not extensible enough, it can happen that if an important upstrea dependeny like payment gateway, auth, etc goes down for some time, your users get significantly affected. Thus a layer of abstraction is crucial for us to make changes in our componenets as requried, and not have strong coupling with upsteam providers.

I will do all of these in different languages to share a feel on how each language has its own philosophy of doing things. Also, in these Machine Coding Rounds, you will be expected to write fully-functional code (maybe with class diagrams as well) in an hour, so practise these :

* Design Tic Tac Toe
* Design ATM
* Design Login System
* Design Web Scraper (will be used to train AI models, diffenrent forms of data finally converted to text )
* Design Parking Lot (vehicle entry, exit and pricing model)
* Design Library Management (catalog users, borrow-return logic)
* Design Snake Game (dynamic movement and collision detection) and Chess Game
* Design Rate Limiter (Token bucket or sliding window algorithm)
* Design Elevator System (multi-threaded handling of floors and requests)
* Design Message Queue (Pub-Sub)
* [Design In-memory File System](https://leetcode.com/problems/design-in-memory-file-system)
* Design SQL (data structures to use, generic type of data, adding indexing, making it multithreaded, making it extensible, adding logs, deadlocks management)
* Concurrent Logger system
* Multi-directory file system with read-write permissions

## API Design Rounds

This is a new thing in the market, and similar to LLD, its just that we need to create API. In a general system design round, I dont spend too much time on API, but as its an API Design round, I can go deeper. API designing round expects you to write production standard API to solve the problem. Later you can be asked to extend the solution by implementing approrpiate design patterns. [This guide]([https://github.com/Devinterview-io/api-design-interview-questions](https://www.hellointerview.com/learn/system-design/core-concepts/api-design)) is a good read. But still, I am writing from my side.

First of all, the HTTP Methods :
* GET is to retrieve data
* POST is to create new data everytime (not idempotenet - we get different creation when we run it)
* PUT is to update/replace data (its idempotent - we get the same row updated everytime)
* PATCH is for partial update (when we only want to change a part of resource - say date)
* DELETE removes data
And some response code :
* 200 - Success and 201 - Success and Created
* 400 - Bad Request; 401 - Not Authenticated and 404 - Not FOund
* 500 - Server Error
```python

```
Generally speaking, the followups in API Designs are either :
* DB Schema desing
* Rate Limiting with 429 - Too Many Requests
* Scaling async using worker pools via queues
* Pagination - When the endpoint is going to return ton's of resources, and such a massive JSON payload is pretty high latency. Now if things are simple (read-heavy systems), use Page - `GET /events?page=2&limit=25`. But in case of write-heavy systems, this would fail as the rows are being constantly updated in DB. So instead of hopping to a Page, we hop using a Cursor - `GET /events?cursor=123&limit=25` saying to give us next 25 items, starting from ID 123 where the cursor is at presently.
* API Versioning
* For security, we should authenticate the API using JWT or session token simply.

# High Level Rounds

Everybody seems to throw scaling buzzwords in interviews as if they are being hired to build the next Whatsapp! Most probably you will do some vibe coding in your day-job, be honest!

But anyways, understanding the building blocks of designing a large scale system is cool. The broad understanding of designing large-scale systems in these domains are required.

Things to keep in mind :
* You should know the tradeoffs of your decision.
* Any system is infinitely designable, but you should know the precise scope - funcitonal (for users and business) and non functional (engineering implementation nits like availability, security, speed and latency, reliability, etc). Asking ciritical clarification questions when designing. Surge of users? Is the system read/write heavy?
* The design requirements need to be objective, data-driven not subjective. 
* Go step by step, define building blocks, relationship between them (wrt data, responsibility), communication (HTTP/S based API requests, raw TCP/UDP, websockets, RPC, etc) among them, and then according to your requirements, fix scaling bottlenecks. No premature optimization. 
* In case of startups, the design incrementally (MVP -> improve for scale), whereas in Big Tech as we already have customers, we can have a bottom-up approach of building individial components

Technical things :
* Delegate to specializaed component to gain performance out of the system
* We can use epoch (unit time ints) instead of DateTime to improve performance. Range queries for int is significant performant. If only Date is stored, YYYYMMDD is best of both worlds. And, always operate on UTC, as browsers convert them to local time on their own.
* Hard delete is when we DELETE the row from the DB, whereas in Soft Delete, we are marking the row as deleted but not deleting it (recovery, archiving and restoring the data). Also, hard delete with high throughput causes the data to be fragmented on the disk due to repeated Disk I/O being performed by the DB engine and the B+ tree being re-balanced again and again. It's better to batch the soft deletes, and at low-traffic time, do a hard delete of that batch.
* To store image/videos/big files, then throw them in an object storage and make API call. Don't store them in DB or Distributed File System. Unlike DFS, files would be stored using keys and values, as opposed to in a directory hierarchy. You only pay for the space that you use, as opposed to all the hardware in the cluster. Can scale storage independently from compute by nature of cloud. 
* The best practise is to have a 3NF normalized DB to reduce redundancy, we are incuring the cons of having to JOIN which are expensive. 
* Also, REST API designing has to be done
* Syncing among DBs is another bottleneck in case of horizontally scaling the system.
* Application Server (request layer) cache is quite underrated.
* Caching at CDN level spans accross geography. Moslty static data or API responses aare cached here. It gets the content from closest available server, instead of main server. Reduces load on main server, improves uptime, along with improving security. TTL needs to be configured so that. Partition the data such that data for specific geographic regions goes to the particular CDN that you want.
* Caches are not for transactional data.
* Client makes request to server, and server delegates the work to queue (message broker) and returns respose immediately. The task is picked by any worked from the queue, which upon completion writes to the DB. The lag in this process can be an alert as its shouldnt take a lot of time in this process.
* Short Polling (scheduled HTTP request) is almost always a bad idea, but It's still everywhere even now. A lot of front end applications talk to back end applications, sometimes in real time, getting feedback from the back end application via polling. You will be continously bugging the server but most of the times get no data, so there is an unnecessary load on the backend because of our aggressive polling without much benefit. Also, waste clients bandwidth! Another approach is long polling, where the data is not sent empty, that is only make the request when there is data to send. Incase of timeout, process will be repeated. So, it's an HTTP request which completes only when data is available. Connection is open until data is available, thus we can have a lot of open connections. Repeated opening and closing HTTP connections also puts load on the server. A preffered way is using Websockets, where a bi-directional channel is kept open (persistent TCP), and server pro-actively sends messages, client doesn't need to ask. Useful for real-time data transfer (live-streaming, interaction, chat, collaboration, etc). We can pass any data in Websockets. Though it's pretty expensive. If we have idle time when sending data, better not use sockets. Websockets suffers from Thundering Herd problem due to overhead of establishing socket connections if number of servers changes (balancing load after failures or new nodes being added). Another often used choice is Server Sent Events, which is again one directional (server to client). Unlike long polling it uses persistent HTTP connections as opposed to killing and reconnecting. Also unlike websockts, it establishes failed connections automatically. But again, a lot of concurrent connections can add load on the server if they are not needed.
* Its a [common misconception that a client-server setup can have max 65k connections](https://www.youtube.com/watch?v=o-EkdZW4zbA), but TCP connections are actually identified by a unique combination of four elements - Source IP address, Source port, Destination IP address and Destination port. Since each client connects from a different IP address and port combination to the server's IP and port, millions of unique connections can be established to a single server. [WhatsApp scaled upto 3 million connections!](﻿https://youtu.be/vQ5o4wPvUXg?si=cBMWr14CUTjcNXIl﻿)

#### Basic Things
This [video](https://youtu.be/FxAom29OEKE?si=rr_igso2iq0vdnCd) summarizes perfectly.

Latency is end to end time taken by request. throughput is how many requests were processed per second (QPS). P50, P75, P90, P95 and P100. These refer to the percentiles, which gives us a better sense of how the response times are being distributed. So, P50 is 50th percentile, that is the median. So basically, half of the requests are faster and half of the requests are slower than set benchmark. P99 is tail latency. If P99 is 40 minutes, the 99% of people got their response in less than 40 minutes, but for 1% of people took more than 40 minutes.

The holy grail of non-functional requirements in CAP Theorem.
We can only have 2 out of 3 :
* Consistency - all nodes see same data at the same time, so the reads align with most recent writes i.e every read gets the latest write
* Availability - every request gets some respose, successful or not. its uptime/total_time
* Partition Tolerance - system should work despite network failures between nodes

High Availability is necessity these days. For that there has to be failover and automatic recovery, fault tolerance, data consistency, and nice dev tooling for this to happen smoothly without human intervention. Recovery Time Objective (max objective downtime after a failure, ie time between system failure and recovery) and Recovery Point Objective (maximum acceptable data loss measured in time, ie how much time of data loss can we take) are key metrics here. 

Popular availability numbers :
* 2-9 99% is ~3.65 days/year
* 3-9 99.9% is ~8.7 hours/year
* 4-9 99.99% is ~52 minutes/year
* 5-9 99.999% is ~5 minutes/year

Unfortunately, CA never really exists in distributed systems because:
* The network partitions will happen. You can't really opt out of it.
* The real choice is CP or AP, during a partition
* when the network is healthy, you can have all three of them.

Well, we surely need Partition Tolerance in Distributed Systems, so we get to choose between Availability and Consistency. Simple question to ask yourself, will it be catastrophic if two users see different state of the system at the same time? If yes, you need strong consistency over availability. Eventual Consistency means that the user can see stale data for some time (no restrictions on the order in which data updates are delivered or viewed). Strong consistencysimply means that the data has to be updated for all users as soon as it is available. But with eventual consistency, another user can see the data after some time. And that's fine. There is also Casual Consistency, for causea and effect order preservation (comments should appear after post). And the very common read-your-writes which means that users see their own updates immediately, but other people see it at the later point of time. It's very very common as you can understand.

Now, little law can generally be used to estimate the resources that would be required when at any moment a number of requests come. So if you want to know how many requests are sitting inside your system right now, we can use this law. This matters because every request consumes CPU memory threads, database connections, and if it's too many requests per moment, per every moment, the system will crash. So the law is L equals to lambda W, where L is the average number of requests in the system. Lambda is the arrival rate, that is a throughput, and W is the average time spent in the system, that is latency. So if you do some calculations, for an example, if there are 5,000 requests per second that are arriving and the average latency is around 200 milliseconds, then from Little's law, we can say that average number of requests in the system would be 5,000 multiplied by 0.2 seconds, which is like 1,000. So at any moment, approximately 1,000 requests are being processed. And this immediately tells us how many threads may be needed, how many database connections might be required, the memory requirements. So it's a very important thing. It's the calculations that you should be doing when designing the system quite early.

Tools that you could be using in an interview would be:
1. DynamoDB: AP (availability and partition tolerance). DynamoDB is always available, and it always responds. It's eventually consistent by default, meaning the reads might return stale data. We often use it in situations like shopping carts, user sessions, and activity feeds, where stale data for like 100 ms is fine.
2. Postgres: a very famous thing with a single primary setup, which is CP (consistent and partition-tolerant). Here, the consistency is strong, so the reads always get the latest data, but if the primary goes down, writes are unavailable until failover. Generally, these are used in situations like banking, inventory, and booking systems, where we need strong consistency, because stale data means there is some loss of money involved.
3. Cassandra: interestingly tunable. You can configure consistency per query. It could be one, it could be quorum, it could be all. The quorum reads plus quorum writes gives a strong consistency. One read plus one write is eventual consistency, but it's pretty fast.

If you want to discuss more practically, suppose we have a situation where our e-commerce app has orders plus product catalogs. Would we want to use the same database here? No, we would want to use a Polyglot Persistence setup in this situation. The orders could be in PostgreSQL because we want strong consistency, so PostgreSQL gives us that, and we can't lose an order. The product catalog could be in DynamoDB because showing a slightly stale price for 100 ms is fine. Practically, to understand eventual consistency, when we write data for a brief window (milliseconds to seconds maximum), some reads might return the old value. Eventually, all nodes will converge to the same value, and the question you have to ask in this situation is: can our business tolerate that window?

### Large Scale Infra

You dont want to over/under provision your systems. When it comes to ML systems, you need to manage GPUs as well. Also, backups stores will have to be maintained as well. Geography is an important factor to consider as well. So, we do extensive Capacity Planning when designing our systems. We will need to scale down and up depending on the traffic!

The DB strategy could be a primary–replica architecutre, having primary DBs (write) and read replicas. Writes go to the primary, while read-only queries can be distributed across one or more read replicas. The problem here would be the replication lag leading to eventual consistency. This improves write throughput, as slow queries affect writes more. Read replicas do not directly improve write throughput. They remove read work, lock contention and CPU pressure from the primary, leaving more capacity for writes. We dont want too many read requests on one primary DB. So, we are improving availability (replicas can be promoted or serve degraded reads). The read replicas are handled by application code, load balancer or DB proxy. Generally the replication model is asyncronous (write operations are fast as we are not waiting for read relicas confirmation, but the tradeoff is replication lag) i.e. the primary acknowledges a write without waiting for replicas to replay it, and semi sync (waits for atleast one read replica for ACK, so slower writes but better safety). Sync also is there, but thats when high latency is fine and we want really strong consistency, used pretty less.

Another strategy would be to use a Distributed/Sharded DB for scaling writes, wherein the data is splitted among the DBs. A sharded approach is much simpler to manage compared to a multi-master setup (write conflicts, auto- incremental IDs clashing, etc). Also, now with advent of great NoSQL DBs, we get sharding my default and it scales pretty well. Each shard has same schema, and stores subset of rows. Consistency is strong per shard. Hash based sharding is the most common, so no hot shard, even distribution. But range queries is hard, and adding shards can also be difficult. Querying using the shard key is pretty fast as hits the shard directly in O(1), without shard key its quite high latency. If a shard becomes too big, then resharding is another pain in ass using consistent hashing. Generally, we do replication (read scaling) + sharding (write scaling). 

SQL horizontal sharding tradeoffs :
* Sharding breaks joins. Cross shard joins are horrendously expensive
* Transactions become hard as ACID across shards is complex (2PC, SAGAS pattern, god knows what)
* Application logic for resharding and all adds a lot of operational complexity. Changing shard key is painful

NoSQL handles sharding at DB level, not at application level. 

Even if we are on AWS or some other cloud provider, crashes will always be there when the number of machines increase. And also you can have various target groups for different requirements managed by the Load Balancer. Another crucial this is to have deep monitoring memory, cache hits, CPU, etc, for creating target groups initially. Also, dont forget to scale DBs via the Load Balancer. It can keep a limited number of connections. Bloddy hell, overprovison the shared resources (DB, cache, elastic search, etc) a bit, wont hurt you much, but can be life-daving when using god knows what deployment strategy.

We generally use Active-Active Load balancers for improved throughput.

In case of horizontal scaling, the deployment becomes a bit tideous as it happens on all machines, some will pass and some might fail in the CI. Flakes everywhere.

### Operating Systems

A process has its own memeory, pages. [Multi-processing is different from multi-threading](https://www.youtube.com/watch?v=AZnGRKFUU0c). Inter-process communication is hard, so naturally we use mult-threading more.
#### System Calls
#### Process Scheduling and Page Replacement Algorithms
#### Syncronization and Deadlocks
#### Multi-threading and Concurrency

Another crucial thing to focus on is concurrency (running multiple threads/processes at the same time, even on single CPU core not necessarily multiple cores, by interleaving there executions) context switching in the user space), parallelism (exploiting multiple cores for performance i.e multiple processes/threads running over different CPU cores parallely) and asyncronous programming (non-blocking coroutine). Even in the absence of parallelism, concurrency of threads ensures effective use of CPU when one of the thread blocks (for I/O). Most Python devs using async/await don’t really know what’s going on under the hood. async/await is an asynchronous mechanism, NOT a concurrency model. It lets you write non-blocking code that looks like sequential code. It (by itself) does NOT make tasks run concurrently or in parallel on its own. We get concurrency only when we initiate multiple async operations together. It involves delegating I/O to event loop.

Process is a program being executed stuck to one CPU, which can be made up of multiple threads. A thread is the single unit of CPU execution in the process. In each process, there is atleast a main thread and threads share the address space (but has seperate program counter as it may run over different parts of program and seperate stack for independent function calls) in a multi-threaded program thus having smaller memory footprint as threads share same code, heap and everything, while processes don't share the same address space. To take advantage of multi-cores, we use multi-processes in Python. Mult-threading works with shared-memory (shared disk files for IPC). Due to illusion of concurrency, we can run as many threads as we want, but they will not be actual hardware threads (linux kernel pthreads). Threading will only work in real sense when the language supports it - like Java, Go, etc.

Threading (for CPU-intensive tasks) is a concurrent execution model whereby multiple threads within a single process takes turns executing tasks. One process can contain multiple threads. Python has a complicated relationship with threading thanks to its [GIL](https://www.youtube.com/watch?v=KVKufdTphKs&t=731s), which limits the ability of threads to run concurrently when executing Python code. Python can have only one thread executing at a time. So, in case of CPU bound tasks in python, process-based concurrency is superior as its not nerfed by GIL. However, since each process has its memory space, interprocess communication (IPC) can be more challenging to implement. Asyncio (allows for concurrent execution of coroutines) can be seen as a combination of the benefits of threading and processes, allowing for the efficient handling of I/O-bound tasks while still being able to execute CPU-bound tasks concurrently. The async keyword converts a Python function into a coroutine, whereby the coroutine can be executed asynchronously. The async keyword returns a coroutine object that is run by the event loop. What this essentially means is that the coroutine can momentarily pause its execution under the following circumstances:

* Waiting for I/O operations – making network requests, interacting with databases, and more.
* Waiting for external events – specific test conditions before proceeding with actions, monitoring & logging server-side issues, and more.
* Achieving better concurrency – yielding control to the event loop when there are waits (or sleep), running multiple coroutines using asyncio.gather() Coroutines can pause their execution using the await keyword. The await keyword suspends the currently executing coroutine, and the control is yielded to the event loop. The suspend coroutine/task is again scheduled for execution when the awaitables (i.e. I/O, timer expiry, etc.) completes. With the current task suspended, the event loop now schedules and executes coroutines that are ready for execution. Once the awaited task is completed, the earlier suspended coroutine resumes execution from the point where it was paused.

Asyncio is pretty complex in case of production work. And, debugging can be challenging here in complex applications, as the interactions between coroutines can be difficult to reason about.

There are other ways to handle asynchronous logic as well - Callbacks that are hard to manage, Futures/Promises which are cleaner yet nested, and manual Threads that are heavy and complex. Sometimes we need those. But in general interviews, I think the focus would be on async/await made it possible to write asynchronous logic that looks like normal sequential code avoiding thread blocking while improving readability and maintainability.

It is very evident that asynchronous execution is the way to go when the application involves operations with external resources – network requests, database queries, I/O, etc. In such scenarios, the CPU would be less loaded whereby it can pick up other tasks that require its attention. For CPU-bound tasks or blocking I/O, Python asyncio can be used with [ThreadPoolExecutor](https://docs.python.org/3/library/concurrent.futures.html#concurrent.futures.ThreadPoolExecutor) for offloading tasks from the asyncio event loop. Also, Python asyncio with [ProcessPoolExecutor](https://docs.python.org/3/library/concurrent.futures.html#concurrent.futures.ProcessPoolExecutor) offers the benefits of parallelism by making the best use of multi-CPU cores.

Using async in the code may result in some unexpected behavior as global objects and singletons can share state.

But multiple threads working on same data at same time can create race condition, so use Mutexs cautiously (when one thread is in a cirtical section, another should wait outside i.e. atomicity). We want our locks to be as Granular as possible, as the locks make our program syncronous for some time. In case of read/write heavy applications, shared lock help. Suppose there are a lot of reads, then shared lock will allow multiple reads to happen, but mutex on write. 

Another thing is Deadlocks, which can be solved using conditional variables. Conditional variables are just a queue that a thread can put itself into when waiting on some condition. Another thread that makes up the condition true can signal the conditional variable to wake up the thread. A Signal broadcast can wake up all waiting threads. 

We often have thread safe data structures available. So, often we use these constructs unknowingly!

And the age old interview question on Semaphore and Mutexes. Both are synconization primitives. You use them when multiple threads, tasks, or processes access shared resources and you need to prevent unsafe overlap. 

```
threading.Lock()          # mutex
threading.Semaphore(n)    # semaphore
asyncio.Lock()            # async mutex
asyncio.Semaphore(n)      # async semaphore
```

But Mutexes are a locking mechanism, allow only one thread in the critical section - either locked/unlocked. Only one thread/task can enter a protected section at a time. Use it when you have a shared thing that must not be modified concurrently:
* shared counter
* shared dict/list
* file write
* database transaction state
* cache update
* in-memory queue state

```
Thread A acquires lock
Thread B tries to acquire lock and waits
Thread A releases lock
Thread B can continue
```
A semaphore is a counter that allows up to N things to happen concurrently. it controls how many concurrent users can access something. Generally resource can support some concurrency, but not unlimited concurrency. Use it when you want to limit access, but not necessarily to one at a time:
* max 5 concurrent API calls
* max 10 database connections
* max 3 file downloads
* max 4 workers using a GPU

A semaphore with value 1 behaves almost like a mutex, but semantically it means “one permit available,” not “ownership of a lock.”
Interestingly, there are some cute problems on LeetCode revolving around these concepts :

*

### Databases

File stirage is just for blobs of data. There is no querying, no indexnig, no concurreny control, and thus its quite cheap. In contrast, DBs have structured data storage, querying (SQL, filters), indexing, locks/MVCC so is expensive. 

We dont need ACID, update operations and indexing for images/videos/PDFs/backups, so they are stored in File Storage as blobs. In case of user data, orders, transactions, metadata, DBs are used. 

Table just represents entity like users, columns, payments, etc. Row is tuple of data, column is property of entity (has a data type). Primary key is what uniquely identifies a row. It must be unique and cannot be NULL. It's for fast lookup and uniqueness gaurantee. Foreign key is column referencing another tables Primary Key. Its to maintain referential integrity and prevent invalid data. 

There are a variety of DBs :
* Non relational (we dont need gaurantees ) In-memory (caches) like Redis
* Disk Based (normal MySQL, MongoDB, etc)
* Servered (the DB has its own server which is used to interact with the client) and Embedded (running within the application)
* On the basis of data organization - Row and Columnar
* Graph (model subject-object relationships)
* Time Series (any metrics vs time)
* Relational and Non-Relational 
* Blob Storage (dosent care about the data, its just a long binary object) like S3
* Storages for text-based search (ElasticSearch for fuzzy searching, etc)
* Search DB (neither SQL nor NoSQL)

First of all, SQL can scale and NoSQL is not some magic scaling solution. Yes, a kind of DB might not scale with a particular constraint. 

There is always a [discussion of choosing between SQL and NoSQL DB](https://www.youtube.com/watch?v=ufCvXzGSQ_M). Relational DBs hold many rows of unstructured data via a predefined schema and those rows can have relations to others if they share a common key. There are built in query optimizers that return results using declarative SQL. Row-based SQL storage excels in normalized schemas due to B-tree data locality for joins and cross-table ACID transactions (ensure atomicity across tables), optimizing OLTP (Online Transaction processing) workloads where full-row access (its row-based storage) and consistency across relations are critical. is nice when we are consistently writing new data on a per record basis (any user facing application). Generally speaking, they use B-Trees thus reading and writing on disk, along with supporting transactions with two phase locking. 

NoSQL DBs are not opposite of SQL or anything. In reality, NoSQL databases are more stripped down that relational databases, and give the developer more opportunities to choose one that fits the needs for their application, because sometimes it is better at huge scale to abandon some of the features of relational databases in exchange for greater performance. NoSQL generally has objects self contained in document to have more locality on the disk (good for both read and writes and also accessing the whole document, easier to shard, schemaless, only issue is possible data duplication that can be tackled in the application code, no need of complex JOINs). The relational DBs are very well used as they have intutive data models and momemtum. However, they tend to scale poorly when sharded. On writes to many shards may need distributed transactions and on reads to many shards involves many network. Transaction abstraction and locking is slow. B-Tree are also slow for writes (compared to LSTM Trees in memory) as they directly go to disk. We need to set a rigid schema which makes things a bit less maintainable. For high write thorughput, we generally prefer NoSQL. SQL is biased towards using relational and normalized data as data model with ACID transactions, typically using B-Trees with fast reads and slow writes. Its great when correctness is of more importance than speed. Can use for user profiles, product cataloges, event metadata, and more.

Doc DB stores data in JSON/BSON format. MongoDB is document DB where data is written in large nested documents, better data locality (if you choose to organize your data in a way that takes advantage of this), but denormalized (limited joins). They have flexible schema, nested data, horizontal scaling. Doc DBs have richer queries compared to KV, but not as rich as SQL. The unit of storage is collection, which has document inside it. Its stored on disk, indexed on ID, and often compressed.

Cassandra is a wide column data store (NoSQL), has a shard key and a sort key and allows for flexible schemas, ease of partitioning. Multileader/Leaderless replication (configurable) wiht super fast writes (LSM Trees + SSTables) , albeit uses last write wins for conflict resolution (lack of data integrity), but may clobber existing writes if they were not the winner of last write wins condition (timestamps are not relaiable in distributed systems). Great for applications with high write volume, consistency is not as important (some data can be overwritten or lost), all writes and reads go to the same shard (no transactions). 

KV stores have boring queries (only by key). Riak is a key-value store that has an improvement of using CRDTs (conflict free replicated data types) making it eventually consistent. Cassandra doesnt support full ACID though! When you need data integrity of a SQL DB with schema flexibility, use MongoDB (quite popular when transitioning from SQL to NoSQL world) if document data model works for you. Cassendra gives us extremely high single partition high throughput and read throughput but with poor data gaurantees (a good use could be chat applications).

OLTP (MySQL, Postgres is mainly OLTP + light OLAP, Cassandra, MongoDB, DynamoDB) is for handling day to day operations in real time where end user is using the product, row-based storage with normalized schema, follows ACID, strong consistency, good concurreny support. Properties are :
* Many small reads and writes
* Small queries
* High concurrency
* Strict consistency

Another important paradigm is Analytics DB like Clickhouse (column based), Snowflake (SQL OLAP), Elastic search, Timescale (Time series), etc mostly used by devs, (OLAP - Online Analytics Processing) as businesses often need to do run large queries across their historical data, that do full table scans. However, doing such a thing can take a huge performance hit on their database that deals with client interaction. OLAP queries are long running, heavy CPU and disk usage, and large scans, wiht mostly read operations. Hence, they will typically have a second database, for analytics processing, where data is copied some period of time after the fact using an ETL (Extract, Transform, Load) process which is typically scheduled as a batch job. OLTP acts as source of truth. It has denormalized schema (star schema) to have fewer joins, faster reads, and simpler queries. 

We never mix OLTP and OLAP. 
Running analytics on OLTP means unnecessary lock tables, slow production traffic, and bad user experience. Running transactions on OLAP means slow writes, no transactions, and poor concurrency. 

```
User -> App -> OLAP DB
OLTP DB -> Kafka -> OLAP DB <- Dashboards
```

Its column based as required info is just one of the fields. Most transactions based databases use row oriented storage. They store the entire contents of a row together on disk to improve with locality. However, in analytical queries, it is rare that we need the entire row, but rather are aggregating the value of one column over a certain table. Hence, it makes more sense to store the columns of the table together, known as column oriented storage. Analytical tables have tons of columns, and typically we only need to access a subset of them, but many values from that column at a time! Since the values within a value are very similar, we can compress them and achieve even better performance this way! Note that each column must be stored in the same order. If you want columns sorted in a different way, can have a replica of the analytics database with a different sort order. It would acts as an index for efficient querying if you have a common query pattern and would allows more column compression. Writing in sorted files would be inefficent because would have to modify every column file. Instead all writes go to a sorted tree in memory (LSM tree), which is eventually written in bulk to all of the column files once it gets too big. But reads become a bit more complex as they must check both the tree and the column files and merge them. For certain analytics use cases, we also want to be able to store data in a column oriented manner. Like the row oriented case, we are generally doing some sort of exporting/processing of this data (such as with MapReduce or Spark), and therefore we want to be able to store it as compactly as possible so that transferring it over the network is easy! This is where Parquet comes in. 

Very useful to decouple analytics databases from transactional ones as analytics queries can take a very long time. Then there is materialized views in Analytics. Database precomputes common and expensive queries so they do not constantly have to be rerun. The cons would be that writes take longer since materialized views must be updated. Having a lower write thorughput in Data Warehouse setting (not client DB) is fine as its mostly done by batch jobs.

When we have big immutable files to play with, DBs are not exactly a good fit as they are primarily for writing and modifying data in small granularity. Object storage is extremely scalable and cheap. S3 supports strong consistency! We can upload and read (parallized multi-part put and read operations) to S3 using the pre-signed URL (authenticared URL directly interacting with S3) while also maintaining a metadata DB for mapping URL to content directly. You can even store Parquet files in S3, a lot of things. Thats why its so famous and useful.

Normal DBs are not really built for searh. THey can do wildcard matching, but not really built for proper saerch usecases which would require tokenization, ranking, scoring, fuzzy matching. Search DBs care about text relevance, partial matches, ranking. They are able to do these things due to inverted index. Normal index is for a specific row we have values. For inverted index, for a word there is list of docs (list of docs where the word is present). This makes search fastt. Types of search queries supported :
* Full text search
* Partial Match (iph*)
* Fuzzy saerch (iphne)
* Phrase search ('iphone pro' in some sentence)
* filters (price < 50000) and aggregations ()

#### Normalization

Normalization is the process of structuring relational tables to reduce redundancy and anomalies. First Normal Form (1NF) requires atomic values and a primary key. Second Normal Form (2NF) requires 1NF plus no partial dependencies: every non-key column must depend on the entire primary key, not just part of it. In practice, this means eliminating tables where a composite key partially determines a column. Third Normal Form (3NF) requires 2NF and no transitive dependencies: non-key columns cannot depend on other non-key columns. For example, splitting “employees” from “roles” tables so that attributes like employee name aren’t duplicated per role. Higher forms (BCNF, 4NF) address more subtle cases. Normalizing to 3NF ensures that each fact is stored once, which avoids insert/delete/update anomalie. 

Interestingly, we sometimes preserve certain redundancy for improving performance. We dont always need to normalize till last level. Overnormalization has too many joins, slower read performance, and complex queries. So we normalize for correctness (avoid data duplication, inconsistency issue, etc), and then denormalize for performance (end users dont care if you have 1 table for 5, for them it should be quick). Normalize when systems are write heavy, data consistency (in SQL we do it) is critical (like financial systems). We denormalize when system is read heavy (analytics/feeds), caching layers.
So, we normalize the core data, but denormalize the hot paths. 

#### ACID Transactions

The most prominent name in DBs world is Relational DBs becuase of their ACID properties. Transactions are an abstraction used by some databases that provide ACID guarantees about queries - each write in the transaction will either be committed or aborted entirely without any side effects. A database transaction is ACID if it satisfies Atomicity (single unit of execution, all-or-nothing execution preventing data loss and corruption from occurring. It puts all data in write-ahead log before writing them it actual location on disk and mark them as committed when the log is finished. So, if a write is uncommitted and the DB fails, we can replay the log entry), Consistency (complete state change, transactions only make changes with rules/constraints preserved ensuring that corruption in the data does not create unintended consequences for the integrity of your table), Isolation (concurrent transactions behave as if serial, not worrying of race conditions, interveaved transactions, etc. Its the main reason why transactions take a big penalty on the DB), and Durability (successfully executed transactions are committed, changes survive system failure, and post-commit data is recoverable even after system failure) and Isolation (concurrent execution). Durability due to Write Ahead Logging, data being flushed to disk, and replication. Tomicity has the logging overhead. Isolation is a big one. It adds the locks that would reduce concurrency. It's, again, a pain in the ass. And durability has a disk IO latency. So if we have high ACID properties, we have lower throughput.

Well, a lot of NoSQL databases have chosen not to support full DB transactions as they are expensive. Transactions are useful when we are dealing with concurrency as it makes things simple there, but making reads and writes slower. So, generally SQL DBs dont scale well due to ACID complaince. There is not much to do about consistency in noSQL setup.

#### Serializable Isolation

ACID means that all write are serializable, i.e. it appears to the writer as if all transactions ran on a single thread, thus no need to worry about race conditions. And obviously implementing this is hard.
There are multiple ways of ensuring serializability in a database:
* Actually running on a single thread (literally VoltDB does this!)
* Pessimistic concurrency control - Using locks on all read-from and written-to database rows to prevent concurrent updates for the duration of the transaction, others must wait. We use this if we have a lot of contending transactions
* Optimistic concurrency control - Allow transactions to proceed with no locks and abort any transactions that see that the data that they've read or written to has been modified. Since aborting is expensive, this tends to be better only in situations where there is very little contention across transactions

A bit more on locks, as they are extremely crucial for heavily concurrent systems :
* Read or Shared Locks in which the rows are reserved for read and other transactions cant write/update the data locked
* Write or Exclusive Lock is when the rows (as associated indices) are reserved for write, so other transactions cant read and write the data. And, obviously if we use a lot of write lock, it hampers performance.

Silly thing, but lock can be taken on Table, Row, Column, and even page (in B+ trees a page can be locked). If the DB engine detects the lock, it just kills the transaction running which the deadlock was created.

In a distributed environment, maintaining ACID requires a coordination layer. For example, a two-phase commit (2PC) protocol is often used to solve for atomic commit.

Atomic commit - If we want distributed transactions that touch multiple partitions, we need each write to either succeed or fail. This is easy enough to do on a single machine, but when the transaction spans multiple nodes connected via a network, they need to all agree on whether the transaction is committed or aborted (consensus). We need atomic commit to keep things from getting out of sync due to partially completed transactions:
* Cross partition transactions
* Global secondary indexes
* Keeping other derived data consistent like data warehouses or caches

A coordinator node asks each participant (DB partitions) to prepare (vote yes/no), and only if all vote “Yes” does the coordinator broadcast a commit; otherwise it aborts. This ensures atomic commits across nodes, but 2PC can block under failures (is not fault tolerant). Some modern systems use consensus (Raft/Paxos) for metadata or use optimistic commit via logs (e.g. Delta Lake’s transaction log) to provide ACID guarantees on object stores. The beauty of ACID transactions is that users can trust the data that is stored in Delta Lake.

Multi-version concurrency control (MVCC) allows lock-free reads by keeping multiple versions of each record. Writers create new versions instead of overwriting, so readers access a consistent snapshot based on a timestamp or transaction ID. MVCC thus ensures readers never see “half-committed” data. Periodically, old versions are garbage-collected (e.g. PostgreSQL’s VACUUM). It's widely used in RDBMS (Postgres, Oracle) and also in storage engines like RocksDB to handle concurrent updates and snapshot reads without locks.

#### Indexes
Indexing is one of the most powerful ways to speed up database queries in backend systems. Good indexing reduces lookup time, improves joins, and enhances overall performance, without changing application logic.
If we just want to optimize for writes, its just a write ahead log (sequential data stored on disk). The primary job of DB index is to improve lookup performance, on the expense of write performance (as the main table along with index tables need to be updated). Each table is small with 2 columns, but there can be a number of indices to speed up the lookup. It can be :
* Primary Index - A key paired with address to the data for lookup. Small and easy to load in memory. Automatically created on primary keys. Ensures fast lookups for unique identifiers. Always index your primary key fields for efficient record retrieval.
* Clustered Index - Index and data reside together. So lookup is significantly faster, but ofcourse writes are a problem, keeping data and indexes in sync will be challenging. So, don't have too many of them.
* Secondary Index - Created on non-primary columns frequently used in searches. Ideal for fields like email, username, or status. Helps filter queries quickly without scanning the whole table.
* Full-Text Indexes - Optimized for searching phrases and keywords. Useful for blogs, product search, messaging apps. Supports natural language queries like “find posts about backend design.”
* Covering Indexes - Contains all required columns for a query. Allows the database to answer the query using only the index—no table scan. Ideal for SELECT-heavy workloads.
* To improves multi-table queries significantly, index the foreign keys. Ensure both sides of join conditions are indexed.

But, avoid Over-Indexing. Each index increases storage size, slows down write operations (insert/update/delete) and only create indexes for real, repeated query patterns.

Its crucial to monitor the index performance, so use EXPLAIN or ANALYZE to check index usage, and remove unused indexes to reduce overhead. Continuously adjust indexing as your data and queries evolve.

The simplest indexes would be made of hashmaps with both O(1) reads and writes, but the range queries are not possible here as the data is stored randomly. Traditional relational engines use B-tree indexes to organize a balanced tree on disk where each node holds sorted key ranges. B-trees allow efficient point queries and range scans by traversing from root to leaf requiring O(log N) but slower reads and writes (have to write to disk as opposed to memory) compared to hash indexes. In contrast, LSM-tree (Log-Structured Merge-tree) engines (used in Cassandra, RocksDB, HBase) along with SSTables (sorted string table - both are inherently sorted, so this index also supports range queries well), batch writes in memory (memtables) and periodically merge to disk in sorted runs. Writes go to an in-memory BST, which is flushed to immutable sorted tables on disk in SSTable when it gets too big. LSM-trees optimize write throughput by sequentializing disk writes and trading some read complexity (reads may need to check multiple levels as its first performed on tree, and if not available we check SSTables from new to old), but it has faster writes in memory. Also, as there will be lots of duplication in the append-only logs as we update the values in indexes, we can compress the SSTables. When reading, we just query the memtable (BST) and then move towards finding in the SSTables until (slow reads). Its not that brutal if key doesnt exist due to Bloom Filter. As SSTables are sorted, we can binary search on it as well using a in-memory sparse hashmap.

#### Replication

Our database can (and will fail). Additionally, if we only have one database, our read/write throughput is limited to that single node.
We should have multiple copies of the data! Replication can allow us to:
* Withstand hardware failures
* Improve our database performance
* Proximity to user base

Now, we can have:
* Strong Consistency (Linearizability) - On a write, all replicas must process the data before the write is considered committed. Thus, any read to a replica will return up to date data. But, if a single replica is down, we cannot commit any writes. Huge performance hit as consensus hard. This is syncronous replication.
* Eventual Consistency - On a write, only a subset of replicas must process the data before the write is considered committed. Other replicas will be backfilled in the background. But the problem is that reading from certain nodes can return stale data and sometimes its fine!

Stale Reads occur when a replica has not yet received the latest write :
* Clients may read outdated values from replicas
* Common in asynchronous replication
* Can cause temporary inconsistency, especially in distributed systems with high latency

How are we going to replicate? Replicas will send data to one another via a "replication log", which is very similar to a write ahead log (requires same DB engine and version, not portable):
* Captures row-level changes (e.g., via Change Data Capture)
* Flexible, supports partial replication and cross-DB setups
* Adds some overhead and setup complexity

#### Sharding

Replication horizontally scales reads but not writes. Its quite literally always important to have to increase availability. Sharding helps with both by splitting data horizontally, but adds a ton of complexity to the system and should only be used when data is big enough. When a table is under too much load (too big tables with too many queries), or simply storing too much data, we need to split it across multiple computers. We want majority of read and write queries to interact with one shard (if suppose they go to 10 different shards, then the operation can be considered completed only when slowest of them is done), as we want to ensure that the majority of our queries just go to one node. We also want to ensure that none of the nodes are responsible for handling a disproportionately large amount of the load. On each node, we want relatively small and similar amount of reads/writes on the data to avoid hotspots.

When doing distributed transactions, we need to make sure that either succeeds on both partitions, or fails on both partitions. Such cross partition writes are slow.

We can shard/partition :
* Using key ranges where similar keys live on same node, effective for range queries. But there are possibility of hotspots
* Also, we can range based on key hashes, but then there is no way of doing range queries
* Consistent Hashing (range of hash of keys) that allows us to distribute keys by their hash range, while ensuring minimal data rebalancing when the number of shards changes.

It's very much used in Stock Exchanges using Range Partitions.

The caveat is that the data must be shardable. If we need cross DB joins, cross DB consistency requriements, etc then we can't do this. Cross DB joins are extremely expensive and should be done on the application side.

2PC is the classic protocol for atomic commits in a distributed DB, ensuring all nodes commit or all abort. 2PC is simple but can be blocking: if the coordinator fails after sending “prepare” but before final decision, participants may wait indefinitely. To mitigate this, some systems use consensus (e.g. Raft) to coordinate commit logs or use asynchronous replication with conflict detection. Another approach is optimistic concurrency + transaction logs (as in Delta Lake/Iceberg) where readers always see a consistent snapshot and writers append new versions atomically, sidestepping classic 2PC among data nodes.

As mentioned earlier, SQL databases tend to support transactions, which includes transactions across shards. These can be extremely slow due to two phase commit! On the contrary, most NoSQL databases encourage their user to keep their data organized in a way that most operations can be performed on a single shard (no cross shard writes and reads), hence the misnomer that they "scale better". For example, in Cassandra, we have partioning key and all of the shards need to be on that key.

SQL query optimizers use cost-based planning: they enumerate possible join orders, access paths, and choose the lowest-cost plan. Heuristics (e.g. join reordering, predicate pushdown) and statistics (table/cardinalities) guide the planner. Common optimization strategies include transforming subqueries to joins, combining filters, and choosing efficient join algorithms (see below). Indexes dramatically speed up queries by allowing lookups instead of full scans. The most common index is the B-tree index, which stores keys in sorted tree nodes. B-tree indexes offer logarithmic lookup time and support efficient range queries (e.g. all rows between values). For example, a B-tree index on a date column can quickly return all rows within a date range. Hash indexes, by contrast, map keys via a hash function and allow O(1) exact-match lookups, but do not support ordered or range scans (they lose the key order). In analytical engines, columnar indexes and bloom-filters are used: Parquet files, for instance, record per-column dictionary or min/max stats to skip non-matching row-groups. Parquet can also embed Bloom filters per page to quickly exclude pages that do not contain a value

#### Joins

We need to combine rows from two or more tables using a relationship. Without joins and normalization there will be duplicate data, inconsistency, huge ass tables. With joins we have normalized data, single source of truth, and flexible queries. 

SQL has ACID transactions, strong consistency, and supports JOINs (SQL has structured tables and is good in connecting multiple tables using foreign keys). In NoSQL, we dont use much of normalization, and its not good for joins.  

SQL supports several join types:

* Inner Join: Returns rows where the join condition matches on both tables.
* Outer Joins: Left/Right Outer include all rows from one side and matched rows from the other (filling nulls if no match). Full Outer includes all rows from both sides.
* Cross Join: Cartesian product (all combinations).
* Semijoins/Antijoins: (e.g. WHERE EXISTS) return rows from one side that have (or don’t have) matches in the other.

For Join Implementation, at execution time, a DB uses algorithms like:

* Nested-Loop Join: For each row in Table A (outer), scan matching rows in Table B. Simple and good when one table is small or when indexed on the join key - Worst-case cost is O(N×M).
* Hash Join: Build a hash table on the smaller input’s join keys (build phase), then probe with the larger input’s rows (probe phase). Provides O(N+M) time for equi-joins. Excellent for large unordered tables with exact-key predicates.
* Sort-Merge Join: Sort both inputs on the join key and then perform a linear merge scan. Efficient when inputs are pre-sorted (or indexed) on the join key. It requires additional cost to sort if not already ordered.

Modern systems choose among these based on statistics: e.g., use a hash join when both sides are large and unsorted, use merge join if sorted (or a merge-friendly storage like columnar), and fall back to nested loops for highly selective conditions or small inputs. Cost-based optimizers will pick the plan with lowest estimated I/O/CPU.

When analyzing a query in databases like MySQL, the EXPLAIN statement shows the join type, indicating how the database engine accesses and joins tables.

Join types (from best to worst): const, eq_ref, ref, range, index, and ALL. ALL - The worst join type—a full table scan, meaning every row is checked. This is slow, especially for large tables, thus bad for performance. index and range - These are better because they mean the database uses an index to access a subset of data, avoiding full table scans.

Joins are extremely expensive even with the right set of incides! If you have heavily normalized data, then scaling will become difficult. Upto a certain level Joins work really well, but after a limit, we would have to give up on 3NF and add redundancy to the system. So, denormalization helps in scaling SQL.

### SQL vs NoSQL

SQL :
* we need strong ACID
* JOINs and normalization, but slow at scale
* Data consistency
* but its hard to scale horizontally
* schema changes are painful

KV Stores :
* Extremely fast, perfect for cache and sessions
* Easy horizontal scaling
* no querying inside values (nested queries not possible) so poor for complex data
* no JOINs

Doc DB :
* Natural JSON structure is nice, but large docs can groww
* flexible schema
* limited joins support, faster reads
* transactions weaker than SQL

WideColumn DB (cassendra) :
* Massive write throughput so Perfect for time series
* Scales to billions of rows
* But very limited queries, no joins and hard data modelling 

### Distributed Systems

The CAP theorem states a distributed system can simultaneously provide only two of {Consistency, Availability, Partition Tolerance}. In practice, partitions (network failures) are a fact, so systems choose between strong consistency (always agree on a single value) and availability (always respond, possibly stale). Strong consistency (as in traditional RDBMS or Paxos-based systems) ensures every read sees the latest committed write, but can block or fail under partition. Eventual consistency (as in many NoSQL stores) allows reads to return outdated data but guarantees convergence when nodes reconcile. Many modern distributed DBs offer tunable consistency (e.g. Quorum reads/writes in Cassandra, linearizable reads vs timeline in DynamoDB).

Fault-tolerant systems use consensus protocols to agree on state changes. Paxos is the original consensus protocol for agreeing on a value among unreliable nodes. It guarantees safety (consistency) but is complex. Raft is a later protocol designed for understandability: it decomposes consensus into leader election, log replication, and safety rules. In Raft, one leader handles all log appends; if the leader fails, a new election is held. Both Paxos and Raft require a majority of replicas and can tolerate node failures (but not network partitions beyond a majority). These protocols underlie many systems (e.g. etcd, Consul, TiKV) to manage a replicated log or state machine, ensuring that updates (schema changes, metadata commits) occur atomically across nodes

Beyond MVCC, distributed systems use patterns like distributed locking (e.g. ZooKeeper/etcd locks), leader-follower sharding (each partition has a single writer leader), and CRDTs (conflict-free replicated data types) to handle concurrent updates. Many data lake systems use optimistic concurrency: readers get snapshot views and writers append updates; conflicts are resolved via atomic replace or merge (as with Delta Lake’s transaction log.

Just to add on, distributed locks are extremely costly as they are over network with multiple applications and processes. Always prefer other locks in DB as its holy purpose is to ensure consistency. 

### Cache

Is for high throughput systems, when we want to tackle expensive Disk I/O and Network I/O. As cache stores data in RAM, its volatile. We want to maximize cache hit or minimize cache miss. It gives us quick reads and writes.

We generally think of caching when :
* system is read heavy, to reduce DB load (get lower latency as well)
* pre-compute expensive queries

Various cache eviction policies to choose from - FIFO, LIFO, LRU (we remove data that hasent been accessed for long time from the cache) and LFU (both O(1)), MRU and Random Replacement. TTL is expiry of entry in cache which we set so that old data can be removed and stale data isn't served.

Types of caching systems :
* Write around Cache (Lazy Loading) which is default - We write to the DB, not to the cache. We take care of the sync seperately (invalidate the key in cache). Useful for cases where new written data is not immediately read as first read after delete is slow as request will go to DB. Not every write might go to the cache, so we are not flooding it, instead polulating the cache according to the reads. We face cache hits initially. 
* Write through cache - The data is written to DB and cache at same time (2PC makes it slow as the process in syncronous, the response waits until both succeeds). We conclude that the data is updated if both the writes are successful. Thus, real-time sync of DB and cache. The advantage is that we have fast retrivals, data consistency, falut tolerance, but we pay by high write latency. We dont worry about cache misses here.
* Write Back Cache - We write to the cache first, and DB is written in background async with batch writes. This is for very low latency, high throughput, write intensive applications, but has a Data Availability risk with Eventual Consistency. Very high performance. Reading DB may not see write if cache fails. Always have commit logs, we dont want data to be gone if something happens to the cache. Don't use this for transactional data. Complex recovery tbh.

DBs have their internal buffer pools caching the page blocks of disk it has recently read depending on the algorithm applied. As caches get filled up easily, we need an eviction policy, most popular being LRU. Caches also need replication and sharding.

Caching can happen at almost all levels in the architecuture :
* DNS and CDN level 
* Load Balancer (Ngnix, HBASE)
* API Server and API Gateway
* Client Side (cache recent queries made by user on the application side)
* Materialized Table views - in a read-heavy system, precompute JOINs already 
* Precompute expensive aggregations
* Transparent Cache in front on DB (cacheops in Django)
* CPU and GPU caches.

There is client side cache (user specifc images, API responses, CSS/JS thingies, and more), CDN (as edge cache for images, videos, static files). There is DB cache as well, like it caches recently used rows and index pages, but it has problems :
* the cache policy is decided by DB not by dev
* even if we get data from DB cache, we still put load on DB, which was something we wanted to avoid becuase we need to maintain connections
* Redis is much cheaper to scale! As its simple KV pair, no joins, SQL parsing, locks, transactions (usually), giving easy scalability. 1 Redis machines can handle millions of QPS. Also, we can tell redis what to cache and what not to cache. 

Focusing on the open source part of Redis, that is caching. We can set TTL if its not being accessed much, expiring it to reclaim free space. Evictions after we hit the memory limit. LRU is generally used. Reddit executes all transactions touching data on a single thread. Since the data is stored in memeory, if the node fails, we are going to lose the data. So, we use a write-ahead log. It's generally configurable how often entries get flushed to disk, trade durability and performance. In practice, flushing every second has very little performance penalty. Also, it helps avoiding lot of cache misses on restart. Redis allows replicating data using single leader asynchronous replication.

Overall, when desinging system, we would want to minimize :
* Cache misses as they are expensive
* Data consistency in DB and cache creating stale data (eventual consistency)

Cache Stampede or Thundering Herd problem can happen at huge scale when a lot of requests come to cache, get missed, and then hit DB, they might crash the DB due to overload. To fix this we should use mutex so that only one request goes to DB (and other requests if similar retry from cache). So in big billion days if someone wants to buy same phone and hits our system, it can be handled now. You can also use logical expiry (instead of deleting cache at TTL just mark them as expired, so we are still serving old data, while old thread refreshes)  

Some keys can become hot in cache (like you pick ronaldo) getting huge amount of traffic compared to others. Then one Redis shard becomes overloaded, and we are gifted with high latency, CPU spikes, network bottlenecks. To tackle this :
* you can keep it in server cache first, then redis then DB
* or just replicate the hoy key (key sharding)
* if its static, use CDN/edge cache

### Search Indexes

Generally speaking, in order to optimize for search use cases, which can be a very intense query (since we may have to scan through millions or more documents), it can be helpful to use a search index! Lucene (used by ElasticSearch) uses LSM tree + SSTable for its format. It has lot of search capabilities for text, geospatial data, numbers, etc. ElasticSearch is a service that takes the capability of an individual Lucene index and allows it to run over a distributed cluster. ElasticSearch is able to ensure availability through replication, but the major point here is to be able to hold index shards on different machines which are mapped based on the ID of the document. In this sense, ElasticSearch basically creates a bunch of local inverted indexes for the documents on a given node. Ideally, you keep documents that are frequently searched together on the same shard to avoid cross shard queries. ElasticSearch is able to provide extremely fast performance on reads thanks to caching! Caching of index pages in memory by the operating system, cached queries on a shard level in memory (not just the index itself but the actual result of the computation done). Query caches also cache only parts of certain queries to be used again by different queries in the future if they require some data in common (use the same filters).

Ultimately, search indexes are an incredibly important part of many large applications, and are capable of finding strings of text in a manner that is much faster than a typical database query.

### Consumer Systems

Two common implementations :
* Message Queues (Homogeneous Consumers) - each message when gets out of the queue can be picked up by single consumer at random as all consumers are identical. For example, SQS, RabbitMQ, etc. Each message is a task, once processed by consumer we can forget it. 
* Data/Event Streams (Heterogeneous Consumers) - same message can be consumed by multiple consumers, at their own pace. There can be different types of consumers, elastic search, analytics, etc. For example, Kafka. Each event is a fact, stored in an immutable log, never changes, and thus can be replayed, withing retention period independent of consumption (even if consumer has not consumed it). So, we want the events to be immutable (cant go through state change)

There are two sorts of message brokers :
* In memory - Can be done on something like a Redis instance, no persistence, messages that are acknowledged by a consumer are deleted. They obviously are performant.
* Log based (on disk) like Kafka. Messages sent to a topic partition append to a single ordered log (segmented files on disk), enabling O(1) writes without random I/O; partitioning tolerates out-of-order delivery across partitions but guarantees intra-partition order. Consumers track progress via offsets stored in a special topic, resuming exactly from failure points without rescanning entire logs.

### Kafka

If you haven't mentioned Kafka in a system design interview, is it even an interview? It's a log based message broker, that is each piece of data is appended to end of log file on disk (as writes are sequential, they are fast). A topic is just similar set of related events, a kindof logical partitioning of data. A cluster contains multiple brokers. The events are stored in brokers and partitions. Partitions are actual physical partition. A broker can contain multiple partitions. Multiple such brokers exist to avoid single point of failure. A topic partitioning in Kafka can handle more than 50MB/s. It also has replicas

### Data Engineering

Data in data warehouses is highly structured (relational tables with predefined schemas), optimized for SQL analytics on cleaned data, but data lakes primarily store raw unstructured/semi-structured data (logs, images, JSON, videos) without upfront schema enforcement. Data lakes ingest massive volumes of unstructured data in native formats (e.g., Parquet files, blobs) for flexibility, enabling ML/AI on raw sources that warehouses reject due to schema rigidity. Warehouses transform data first ("schema-on-write"), limiting them to processed, tabular formats, while lakes apply "schema-on-read" later via tools like Spark.

Data Lake is the foundational storage containing raw data, on top of which Delta Lake acts as an open format storage layer, managing metadata giving us relaibility, security and performance on the data lake - for both streaming and batch operations. It extends Parquet data files with a file-based transaction log for ACID transactions and scalable metadata handling.

A data lake has four main features:
* Variously sourced storage of raw data
* Supports multiple computing models
* Perfected data management capabilities – Various data sources can be accessed, different data sources can be connected, and schema management and permission management can be supported.
* Flexible bottom-layer storage – Cost-effective distributed file systems like S3, OSS, and HDFS are adopted. The data analysis requirements of corresponding scenarios are met with specific file formats and caches.

Databases are designed for Transactions wheere data is fresh and detailed, Data Warehouses is for analytics as data is cleaned and stuff, is refreshed periodically and is summarized. Databases work slowly for querying large amounts of data and can slow down transactional processes, Data Warehouses don't interfere with any processes and are generally faster. These days, Data/Delta Lakes is mostly used for managing large amounts of raw data, useful for un/semi/strcuture as well as streaming data with Schema on Read - accepted even if data is not exactly aligned with schema. Data Lake also supports it whereas Data Warehouse is Schema on Write i.e the data is discarded when writing if its not aligned with schema. Also ACID transaction support is there in Delta Lake and Warehouse but Lake has minimal support. Also, the data from Delta Lake and Data Warehouse doesnt leave the system curropted (unlike Data Lake) making it reliable.

Design a distributed data lake architecture that can handle petabyte-scale data How would you build a high-performance object storage system with ACID compliance? Design a metadata management service for lakehouse operations Architecture for data compression and optimization at scale

#### Stream and Batch Processing

Batch jobs like Spark ETL efficiently transform/aggregate petabytes of lake data (e.g., daily EOD files) into warehouse-ready structures, handling scale/cost where streaming adds unnecessary fault-tolerance overhead for non-real-time needs. Streaming suits low-latency use cases, but batch excels for high-throughput, scheduled computations on accumulated unstructured data without always-on infrastructure.

Most modern companies hold an immense volume of data about things such as user activity or usage patterns, and want to gain insights on it through some massive and long computation. While they could do so via a data warehouse, the range of functionality that they could perform is inherently limited by the SQL query language. Instead, sometimes it is useful to be able to run arbitrary code on tons of unstructured data.

Traditional database/warehouse approach follows a store-then-query pattern: data arrives → persisted to disk → later queried for computation. This works for batch analytics and reporting but fundamentally breaks down when you need low-latency, continuous, scalable processing. Stream processing inverts this: process-then-store (or process-and-never-store). Data is acted upon while in motion, immediately after creation at the source (sensor, mobile app, CDC, log). The compute happens before or instead of persistence. This isn't just a latency optimization, it enables entirely new application categories (ride-hailing, real-time fraud prevention, IoT control loops) that are architecturally impossible with request-response database patterns.

Change Data Capture (CDC) streams database changes (inserts, updates, deletes) from transaction logs to consumers like caches, search indexes (Elasticsearch), data warehouses (Snowflake), and data lakes, keeping derived systems fresh without full table scans. CDC invalidates/updates in-memory caches (Redis) instantly when source data changes, preventing stale reads in high-traffic apps like e-commerce carts or user profiles. Changes feed Elasticsearch for real-time indexing or warehouses/lakes for continuous ETL, enabling live dashboards, BI tools, and ML feature stores without batch delays. Event-driven architectures use CDC for inter-service sync (e.g., order DB → inventory service), fraud monitoring, and audit trails, often via Debezium + Kafka. Compaction retains only latest key values in persistent logs, optimizing storage as downstream systems overwrite prior states.

We often run large distributed computations over huge datasets! And most probably batching (or micro batching) is fine, streaming is an overkill, but in some high-stake situations like Fraud Detection, its useful.

Batch processing (ETL jobs, custom scheduled reports, etc) is for scheduled processing of collection of data, while Stream Processing is for real-time processing of continuous data, stream processing messages being generated by producers, stored by a broker, and then handled by consumers and processed one at a time, as opposed to in a batch. If you have EOD files, we can store in data store and we can use Apache Spark (better than MapReduce as it materializes immidiate state to HDFS which is mostly not required, just wastes a lot of computation) to process and transform them into digestable formats. Before that MapReduce was used earlier but it has multiple performance problems. There is an inherent latency in batch processing as we are waiting for data and then process it, whereas stream processing is low-latency. And obviously, batch processing has high throughput and needs significant resources to collect and process the batch of data, but after done, the infrastructure can be deprovisioned. But in stream processing, a resiliant always-on infra is required and the throughput varies. So stream processing in inherently more complex as there is an angle of fault tolerance and data consistency issues.

In stream processing, the data stream is unbounded.
Three important terminologies here are :
* Window - A time period in which data is analyzed
* Aggregates - Summary statistics calculated from data
* Joins - Combined variety of data on basis of common attribute. This is very important. For example in Uber, you need to account for user location and request, car availability, traffic for ETA, etc to decide the price of the uber ride! We need to optimize based on real-time factors, thus real time analytics. Other cases are credit-card fraud, predictive analytics, etc.

Like with batches, there are data associations with streams and we want to reduce the number of network calls made to an actual database. In order to do so, we often have to keep some amount of state local to the stream, representing some other data source. However, we now run the risk that processing certain stream events becomes nondeterministic.
* Stream Stream - Joining two different types of events in a stream (such as a search in the search bar, as well as zero or more clicks that occur from a search). Can keep a local index of both types of events on the message broker, and when a new event comes in, check the other index in order to see if there is a join to be made. If events are only valid for a certain window of time, they can be removed from the index after that amount of time.
* Stream Table - Enriching one stream event with data from a database table, possibly in order to send to another stream. Keep a local copy of the table in the consumer as cache in order to avoid having to make network calls (slow) to the database for each join, but this has consistency problem. So, we subscribe to the change data capture of the database table (turning a source DB effectively into a stream allows us to get low latency and maximum possible throughput) in order to make changes to the local copy of the table in accordance with the actual table.
* Table Table - Occasionally we might even have to keep multiple local copies of a table up to date in our cache near consumer, in order to perform joins on them. In order to do this, we have to subscribe to multiple sources of change data capture. Effectively, the result of the joined streams maintains a cache of the actual SQL query of the two

Batch Processing Frameworks abstract away many of the distributed computing difficulties from us!
* Specify operators to modify the data
* Specify how you want data to be partitioned
* Allow checkpointing intermediate state to avoid restarting whole job if one node fails
* Try to perform computations where data already is stored to avoid unnecessary network usage (take advantage of data locality)

The Stream Processing can be :
* Stateless - Each event is processed independently, with no memory of previous events. The processing function is a pure transformation. Horizontal scaling is trivial as no coordination needed between parallel instances since no shared state exists, Fault tolerance is simple as restart from last committed Kafka offset so no state to recover, Latency is minimal as there is o state lookups and no windowing delays, and throughput can be massive. Its used when Filtering, routing, enrichment (joining with static lookup tables), Format transformations (Avro → JSON, schema migration), Simple rule-based decisions that don't depend on history, Fan-out/fan-in patterns where each event is self-contained, etc
* Stateful - Processing that maintains and queries state across multiple events. For example, anomaly detection using a 1 hour sliding window to detect payment spikes combining multiple events across time and potentially across different sources (credit card + mobile app + point-of-sale). Here the state backend matters (Flink has RocksDB and this choice affects latency, capacity, and recovery time), Checkpointing is critical as periodic snapshots of state to durable storage (S3, HDFS) for exactly once recovery, Rescaling is complex (when adding/removing parallelism, state must be redistributed, Flink handles this via key-group-based state partitioning), bacnpressue also needs to be handled, and memory management is crucial (avoid OOMs)

Streaming is hard :
* There is an risk of out of order events.
* Recovery from failures is tricky. When it fails, the data gets backedup and pressure gets more and more. As the system is stateful, checkpointing (or savepoints if external systems are involved) jobs at schedule is the main way Flink manages failures, also offsets from Kafka help (early, latest, specifc failure timestamp)
* Also if we don't process messages quickly enough we may run out of memory on the broker. So, messages need to be persisted sequentially on disk in the form of write-ahead log, instead of being kept in memory. So, messages are not deleted upon consumption, so can be replayed down the line using last read offset.

Kafka is a distributed system that stores and buffers messages, called “events”, which are stored on disk in numbered “partitions” within named “topics”. Each topic can be multiple partitions decided by the message key. Kafka “producers” append events to partitions, and Kafka “consumers” read events from partitions. Consumer groups allow us to specify a list of subscribed topic partitions, and then divide them across consumers in the same group. Consumer groups also keep track of commited transaction offserts accross all of subscribed topic partitions, if one consumer fails, we it comes back we start from last commited offset. There is an internal consumer offsets topic to keep track of the last known offset consumed by a variety of consumers on all topics. There is leader consensus used to manage these nodes. Kafka transactions give us an option of achieving exactly once, least once, and most once messaging processes. But when (and when not) to use Kafka?
* Its a message broker, transacitonal, high volume big data, etc
* Its an event store as well! We have retension ability within topics which can be replayed, while keeping things decoupled. Yes we can store even PB of data in Kafka, its not for analytics. Also, when backfilling, we can use Data Lake which is optimized for throughput instead of Kafka as we dont really need latency.
* Its an integration layer. We can push events from Mainframe, CDC, etc and push to consumers from Snowlfake to MongoDB
* Also for stream processing with Flink

Kafka producers are generally thread-safe, and it is a common practice to use a single producer instance across multiple threads in an application. This allows for efficient batching of records, which improves throughput. The standard Apache Kafka consumer is not thread-safe and is typically designed to run in a single thread per consumer instance. he primary reasons for this design choice are: 
* By processing records from a partition in a single thread, Kafka guarantees that messages within a given partition are processed in the exact order they were written. This simplifies client-side logic.
* Parallel processing is primarily achieved by adding more partitions to a topic and running multiple consumer instances (or threads within a concurrent container in frameworks like Spring Kafka), where each consumer instance handles one or more unique partitions. The maximum number of concurrent consumers in a consumer group is limited by the number of partitions. 
So, Kafka provides per-partition backpressure to prevent slow processing from overwhelming memory. In conclusion :
* Single-threaded per partition preserves order, prevents chaos.
* Partitions = horizontal threads → throughput scales linearly.
* Per-partition backpressure isolates slow messages.
* Consumer groups distribute load automatically.
In-memory message brokers make sense only when we want maximal throughput and having out of order events dont matter with no durability and fault tolerance! A good use case for this could be video encoding as the data is huge and we dont really care which user's video got encoded first.

[Apache Flink](https://youtu.be/9YLOA-8UijI?si=cLpLxrPSTgNFnkmz) is a exactly-once fault-tolerant stateful consumer quite common for stream processing. In case of having multiple applications, producers can publish data into Kafka topics (message broker to decouple producer and consumer, making the interaction async) by APIs, websockets, etc, which then is passed on to the stream processor (Flink) which then joins the inputs of kafka topics into a common key that they both contain, processing the data real-time, and then finally save to storage (S3, Delta Lakes, and more as data warehousing) for long term analysis and end with data sink. Flink also does checkpointing the offset to input and output topics, internal state corresponding to offsets.  Even if the consumer fails, Kafka can store the data, so its replayable making it scalable and fault-tolerant. We would also have a monitoring setup for real-time alerts about the data we processed. The thing is, we might be processing messages out of order. 

State in stream processing is crucial for maintaining context from past events, enabling operations like aggregations, joins, and enrichments that process each incoming event independently while referencing historical data locally for efficiency and fault tolerance. Flink state can be stored in in-memory hashmap or an embedded key-value like RocksDB. Flink computations are performed as a task unit, where the tasks can run in parallel within a node or across many nodes. These tasks send data to one another via streams. It uses watermarking to make sure things are in order. Local state avoids slow remote lookups by storing data (e.g., table changes from a Change Data Capture stream) in-memory or persistently on the processing node. This ensures high throughput, as each event queries or updates state directly without network latency, scaling with parallelism in frameworks like Flink. Fault tolerance uses checkpoints to snapshot and restore state, preventing data loss during failures. The JobManager periodically injects "checkpoint barrier" messages into data streams, which flow through operators in order within log-based input queues (e.g., from Kafka), using the Chandy-Lamport algorithm variant, give consistent global view. Operators align on barriers from all inputs (non-blocking background snapshots), take local state snapshots to durable storage like S3, and acknowledge completion back to the JobManager. A checkpoint succeeds only when all nodes confirm, enabling restarts from that consistent state without duplicates. Upon failure, Flink restores state from the latest completed checkpoint across all nodes and resumes processing subsequent records, pausing in-flight messages until consistency. This prevents events from being processed multiple times, as barriers ensure snapshots capture exactly the state at barrier points. Background non-blocking snapshots minimize latency while maintaining causal ordering. Flink prioritizes immediate correctness over availability trade-offs. Exactly-once processing enforces linearizability-like guarantees for state updates, coordinating barriers across inputs to align snapshots precisely, preventing reprocessing of committed events. In contrast, eventual consistency might allow temporary divergences that resolve later, which Flink avoids to support reliable aggregations and joins in stateful streaming. For an example, consider ingesting database changes (inserts/updates/deletes) via CDC into a stream, holding a local copy of the "users" table keyed by user ID. Incoming transaction events join against this state: if a transaction for user "123" arrives and matches a local entry (e.g., enriched with user details like email), Flink outputs the enriched record immediately. Updates to the users table propagate incrementally, keeping state current without reprocessing the entire stream.​​

For Fault Tolerance we need to ensure that each message is processed exactly once. Every message processed at least once and Messages not processed more than once - Can use idempotence, which is some way of keeping track of seen messages (usually via a unique message ID) to ensure that they are not processed multiple times. Could also use atomic transactions (see two phase commit), which are slower and expensive so generally skip.

The common sinks are - another Kafka topics, Iceberg (one of the reason it was created and is preffered over Hive which is very batch centric is its support for appending data to a partioning instead of overwriting. So iceberg data tables can be populated by streaming and also easily queried by batch pipelines) and obviosly Postgres.

For simpler stateless/lightly-stateful workloads tightly coupled to Kafka, Kafka Streams as a library is operationally simpler. For complex stateful processing, SQL-based pipelines, or unified batch+stream, Flink's cluster model provides more capabilities.

Recall log based streams optimize for persistence and ordering, whereas in memory streams optimize for speed and are better suited for tasks that take a long time to execute.

Now, generally when designing such systems, there are functional requriements of pulling data from multiple sources, transforming it for suitable analysis, and allowing analysts to query data. Whereas, the non functional requirement would be low-latency, resilient infra with crash and fault tolerance and checkpointing, scalability to huge quantity of data ingested and transformed.

Choice of DBs:
* For Real-time analytics & user-facing dashboards, prefer Apache Pinot. Built from the ground up for Kafka + Flink ingestion. Sub-100ms P95 query latency even at billions of events/day. Upserts + star-tree indexes natively.
* You need strong transactional guarantees on the stream-processed results. You need strong transactional guarantees on the stream-processed results. Survives sharding + multi-region chaos while giving you full ACID on the final enriched data. Use when money or inventory is involved.

First thing is to think about the data source, is it a time-series, a simple point-in-time DB for state of application, etc? We can use Spark clusters for simaltaneous data processing, thus horizontally scaling our ETL pipeline, thus the batch job is distributed. 

Single-leader replication is preferred over multi-leader or leaderless schemes in systems like Kafka and Flink for strong consistency, simplicity, and ordered processing, especially where total event ordering matters more than maximum write throughput.​

### MLOps

# Why I wrote this?

So that I can ponder over these notes in my university classes before interviews as well (づ｡◕‿‿◕｡)づ
