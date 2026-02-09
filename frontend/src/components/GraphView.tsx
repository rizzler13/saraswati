import { useRef, useEffect, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'

interface GraphNode {
    id: string
    type: 'Paper' | 'Concept' | 'Author'
    label: string
    position: [number, number, number]
    size: number
    color: string
}

interface GraphEdge {
    source: string
    target: string
    type: string
}

// Mock data for initial render
const mockNodes: GraphNode[] = [
    { id: '1', type: 'Concept', label: 'LLM', position: [0, 0, 0], size: 1.5, color: '#00d4ff' },
    { id: '2', type: 'Paper', label: 'GPT-4', position: [3, 2, 1], size: 1, color: '#00ff88' },
    { id: '3', type: 'Paper', label: 'Llama 2', position: [-2, 3, -1], size: 0.8, color: '#00ff88' },
    { id: '4', type: 'Concept', label: 'RLHF', position: [-3, -2, 2], size: 1.2, color: '#00d4ff' },
    { id: '5', type: 'Paper', label: 'Claude', position: [2, -3, 0], size: 0.9, color: '#00ff88' },
]

function Node({ position, size, color, label, type }: GraphNode) {
    const meshRef = useRef<THREE.Mesh>(null)
    const [hovered, setHovered] = useState(false)

    useFrame(() => {
        if (meshRef.current) {
            meshRef.current.rotation.y += 0.005
        }
    })

    return (
        <group position={position}>
            <mesh
                ref={meshRef}
                onPointerOver={() => setHovered(true)}
                onPointerOut={() => setHovered(false)}
                scale={hovered ? 1.2 : 1}
            >
                {type === 'Concept' ? (
                    <octahedronGeometry args={[size * 0.5, 0]} />
                ) : (
                    <sphereGeometry args={[size * 0.3, 16, 16]} />
                )}
                <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={hovered ? 0.5 : 0.2}
                    transparent
                    opacity={0.9}
                />
            </mesh>
            {hovered && (
                <Text
                    position={[0, size * 0.5 + 0.5, 0]}
                    fontSize={0.3}
                    color="#ffffff"
                    anchorX="center"
                    anchorY="bottom"
                >
                    {label}
                </Text>
            )}
        </group>
    )
}

function Edge({ start, end }: { start: [number, number, number]; end: [number, number, number] }) {
    const points = [new THREE.Vector3(...start), new THREE.Vector3(...end)]
    const geometry = new THREE.BufferGeometry().setFromPoints(points)

    return (
        <line geometry={geometry}>
            <lineBasicMaterial color="#00d4ff" transparent opacity={0.3} />
        </line>
    )
}

function Scene() {
    return (
        <>
            <ambientLight intensity={0.3} />
            <pointLight position={[10, 10, 10]} intensity={1} color="#00d4ff" />
            <pointLight position={[-10, -10, -10]} intensity={0.5} color="#8b5cf6" />

            {mockNodes.map((node) => (
                <Node key={node.id} {...node} />
            ))}

            <Edge start={mockNodes[0].position} end={mockNodes[1].position} />
            <Edge start={mockNodes[0].position} end={mockNodes[2].position} />
            <Edge start={mockNodes[3].position} end={mockNodes[4].position} />
            <Edge start={mockNodes[0].position} end={mockNodes[3].position} />

            <OrbitControls enableDamping dampingFactor={0.05} />
        </>
    )
}

export function GraphView() {
    return (
        <div className="graph-container">
            <div className="graph-overlay">
                <button className="graph-button active">3D View</button>
                <button className="graph-button">2D View</button>
                <button className="graph-button">Timeline</button>
            </div>

            <Canvas
                camera={{ position: [8, 8, 8], fov: 50 }}
                style={{ background: 'transparent' }}
            >
                <Scene />
            </Canvas>
        </div>
    )
}
